/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEmberAccountConfiguration, IEmberAccountProvider } from '../../../../base/common/product.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEmberAccount, IEmberAccountService } from '../common/emberAccount.js';
import { EmberAccountState, buildAuthRedirectUrl, isAccessTokenExpired, isAccountBackendConfigured, isAuthCallbackUri, normalizeAccountUrl, parseAuthCallback } from '../common/emberAuthGate.js';

/** Secret-storage key holding the refresh token. */
const REFRESH_TOKEN_KEY = 'ember.account.refreshToken';

interface ITokenResponse {
	readonly access_token?: string;
	readonly refresh_token?: string;
	readonly expires_at?: number;
	readonly expires_in?: number;
	readonly user?: {
		readonly id: string;
		readonly email?: string;
		readonly user_metadata?: { readonly full_name?: string; readonly name?: string; readonly avatar_url?: string };
	};
	readonly error?: string;
	readonly error_description?: string;
	readonly msg?: string;
}

interface IPendingSignIn {
	readonly codeVerifier: string;
	resolve(code: string): void;
	reject(error: Error): void;
}

/** RFC 7636 code verifier: 64 chars from the unreserved set, via base64url of random bytes. */
function generateCodeVerifier(): string {
	const bytes = new Uint8Array(48);
	crypto.getRandomValues(bytes);
	return encodeBase64(VSBuffer.wrap(bytes), false, true);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return encodeBase64(VSBuffer.wrap(new Uint8Array(digest)), false, true);
}

export class EmberAccountService extends Disposable implements IEmberAccountService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<EmberAccountState>());
	readonly onDidChangeState: Event<EmberAccountState> = this._onDidChangeState.event;

	private _state = EmberAccountState.Unresolved;
	get state(): EmberAccountState { return this._state; }

	private _account: IEmberAccount | undefined;
	get account(): IEmberAccount | undefined { return this._account; }

	private _accessToken: string | undefined;
	private _expiresAt: number | undefined;
	private _refreshToken: string | undefined;

	/** In-flight refresh, so concurrent callers share one network round-trip. */
	private _refreshInFlight: Promise<string> | undefined;

	private _pending: IPendingSignIn | undefined;

	get providers(): readonly IEmberAccountProvider[] {
		return this.configuration?.providers ?? [];
	}

	/**
	 * The configured backend with its URL normalized to the project origin, or
	 * `undefined` when this build ships without accounts.
	 */
	private get configuration(): IEmberAccountConfiguration | undefined {
		const configuration = this.productService.emberAccount;
		if (!isAccountBackendConfigured(configuration)) {
			return undefined;
		}
		if (!this._normalized || this._normalized.source !== configuration) {
			const { url, strippedPath } = normalizeAccountUrl(configuration.url);
			if (strippedPath) {
				this.logService.warn(`[ember-account] product.json 'emberAccount.url' pointed at the ${strippedPath} API; using the project origin ${url} instead. Configure the plain project URL.`);
			}
			this._normalized = { source: configuration, value: { ...configuration, url } };
		}
		return this._normalized.value;
	}
	private _normalized: { source: IEmberAccountConfiguration; value: IEmberAccountConfiguration } | undefined;

	constructor(
		@IProductService private readonly productService: IProductService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IRequestService private readonly requestService: IRequestService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IURLService urlService: IURLService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(urlService.registerHandler({
			handleURL: async (uri: URI) => this.handleCallback(uri)
		}));

		this.resolveStoredSession();
	}

	/**
	 * Reads the stored refresh token and exchanges it for a session. Until this
	 * settles the state stays Unresolved so the gate does not flash at a
	 * returning user.
	 */
	private async resolveStoredSession(): Promise<void> {
		if (!this.configuration) {
			this.setState(EmberAccountState.SignedOut);
			return;
		}
		try {
			const stored = await this.secretStorageService.get(REFRESH_TOKEN_KEY);
			if (!stored) {
				this.setState(EmberAccountState.SignedOut);
				return;
			}
			this._refreshToken = stored;
			await this.refreshSession();
			this.setState(EmberAccountState.SignedIn);
		} catch (error) {
			// A stored token that no longer redeems (revoked, project rotated) is
			// an expected state, not a failure: drop it and present the gate.
			this.logService.warn('[ember-account] stored session could not be restored', error);
			await this.clearSession();
			this.setState(EmberAccountState.SignedOut);
		}
	}

	private setState(state: EmberAccountState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;
		this._onDidChangeState.fire(state);
	}

	async signIn(providerId: string): Promise<void> {
		const configuration = this.configuration;
		if (!configuration) {
			throw new Error('No account backend is configured for this build.');
		}

		// Supersede any previous attempt so a stale callback cannot resolve it.
		this._pending?.reject(new Error('Superseded by a newer sign-in.'));

		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);

		const code = new Promise<string>((resolve, reject) => {
			this._pending = { codeVerifier, resolve, reject };
		});

		const redirectTo = buildAuthRedirectUrl(this.productService.urlProtocol);
		const authorize = new URL(`${configuration.url}/auth/v1/authorize`);
		authorize.searchParams.set('provider', providerId);
		authorize.searchParams.set('redirect_to', redirectTo);
		authorize.searchParams.set('code_challenge', codeChallenge);
		authorize.searchParams.set('code_challenge_method', 's256');

		await this.openerService.open(URI.parse(authorize.toString()), { openExternal: true });

		const authCode = await code;
		await this.redeemAuthCode(authCode, codeVerifier);
		this.setState(EmberAccountState.SignedIn);
	}

	private async handleCallback(uri: URI): Promise<boolean> {
		if (!isAuthCallbackUri(uri.authority, uri.path)) {
			return false;
		}
		const pending = this._pending;
		const result = parseAuthCallback(uri.query, !!pending);
		this._pending = undefined;

		if ('error' in result) {
			this.logService.warn(`[ember-account] sign-in callback rejected: ${result.error}`);
			pending?.reject(new Error(result.error));
			// Still claim the URL: it was addressed to us, and letting it fall
			// through would hand an auth code to another handler.
			return true;
		}

		pending?.resolve(result.code);
		return true;
	}

	private async redeemAuthCode(authCode: string, codeVerifier: string): Promise<void> {
		const response = await this.post('/auth/v1/token?grant_type=pkce', 'emberAccount.redeemAuthCode', {
			auth_code: authCode,
			code_verifier: codeVerifier
		});
		await this.adoptSession(response);
	}

	private async refreshSession(): Promise<string> {
		if (!this._refreshToken) {
			throw new Error('Not signed in.');
		}
		const response = await this.post('/auth/v1/token?grant_type=refresh_token', 'emberAccount.refreshSession', {
			refresh_token: this._refreshToken
		});
		await this.adoptSession(response);
		if (!this._accessToken) {
			throw new Error('Token refresh returned no access token.');
		}
		return this._accessToken;
	}

	private async adoptSession(response: ITokenResponse): Promise<void> {
		if (!response.access_token || !response.refresh_token) {
			throw new Error('Token response was missing credentials.');
		}
		this._accessToken = response.access_token;
		this._refreshToken = response.refresh_token;
		this._expiresAt = response.expires_at
			?? (response.expires_in ? Math.floor(Date.now() / 1000) + response.expires_in : undefined);

		if (response.user) {
			const metadata = response.user.user_metadata;
			this._account = {
				id: response.user.id,
				email: response.user.email,
				displayName: metadata?.full_name ?? metadata?.name,
				avatarUrl: metadata?.avatar_url
			};
		}

		// Supabase rotates the refresh token on every exchange, so the stored
		// copy must be replaced each time or the next start redeems a dead one.
		await this.secretStorageService.set(REFRESH_TOKEN_KEY, this._refreshToken);
	}

	async getAccessToken(): Promise<string> {
		if (!this._refreshToken) {
			throw new Error('Not signed in.');
		}
		if (this._accessToken && !isAccessTokenExpired(this._expiresAt, Date.now())) {
			return this._accessToken;
		}
		// Collapse concurrent callers onto one refresh; a second exchange would
		// invalidate the token the first one just obtained.
		this._refreshInFlight ??= this.refreshSession().finally(() => { this._refreshInFlight = undefined; });
		return this._refreshInFlight;
	}

	async signOut(): Promise<void> {
		const token = this._accessToken;
		await this.clearSession();
		this.setState(EmberAccountState.SignedOut);

		if (token) {
			try {
				await this.post('/auth/v1/logout', 'emberAccount.signOut', {}, token);
			} catch (error) {
				// The local session is already gone; a failed server-side revoke
				// must not leave the user apparently still signed in.
				this.logService.warn('[ember-account] sign-out could not be confirmed by the server', error);
			}
		}
	}

	private async clearSession(): Promise<void> {
		this._accessToken = undefined;
		this._refreshToken = undefined;
		this._expiresAt = undefined;
		this._account = undefined;
		await this.secretStorageService.delete(REFRESH_TOKEN_KEY);
	}

	private async post(path: string, callSite: string, body: object, bearer?: string): Promise<ITokenResponse> {
		const configuration = this.configuration;
		if (!configuration) {
			throw new Error('No account backend is configured for this build.');
		}
		const context = await this.requestService.request({
			type: 'POST',
			url: `${configuration.url}${path}`,
			callSite,
			headers: {
				'Content-Type': 'application/json',
				'apikey': configuration.anonKey,
				'Authorization': `Bearer ${bearer ?? configuration.anonKey}`
			},
			data: JSON.stringify(body)
		}, CancellationToken.None);

		const response = await asJson<ITokenResponse>(context);
		const status = context.res.statusCode ?? 0;
		if (status < 200 || status >= 300) {
			throw new Error(response?.error_description ?? response?.msg ?? response?.error ?? `Request failed with status ${status}.`);
		}
		if (!response) {
			throw new Error('Account backend returned an empty response.');
		}
		return response;
	}
}

registerSingleton(IEmberAccountService, EmberAccountService, InstantiationType.Eager);
