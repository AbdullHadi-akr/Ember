/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IEmberAccount, IEmberAccountService } from '../../../services/emberAccount/common/emberAccount.js';
import { EmberAccountState, isAccountBackendConfigured } from '../../../services/emberAccount/common/emberAuthGate.js';

export const EMBER_AUTHENTICATION_PROVIDER_ID = 'ember';

/**
 * Surfaces the Ember account as an authentication provider, so it is listed in
 * the Accounts menu (with Sign Out) like any other signed-in account.
 *
 * Sessions are only ever created through the sign-in gate: the workbench is not
 * reachable while signed out, so there is nothing for {@link createSession} to
 * start from here.
 */
class EmberAuthenticationProvider extends Disposable implements IAuthenticationProvider {

	readonly id = EMBER_AUTHENTICATION_PROVIDER_ID;
	readonly supportsMultipleAccounts = false;

	private readonly _onDidChangeSessions = this._register(new Emitter<AuthenticationSessionsChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	/** The session last announced, so sign-out can report what was removed. */
	private announced: AuthenticationSession | undefined;
	/** Bumped per state change, so a slow token lookup cannot announce a stale session. */
	private generation = 0;

	constructor(
		readonly label: string,
		private readonly accountService: IEmberAccountService,
		private readonly logService: ILogService,
	) {
		super();

		this._register(this.accountService.onDidChangeState(() => this.onDidChangeAccountState()));
		this.onDidChangeAccountState();
	}

	private async onDidChangeAccountState(): Promise<void> {
		const generation = ++this.generation;
		const current = await this.currentSession();
		if (generation !== this.generation) {
			return;
		}
		const previous = this.announced;
		this.announced = current;

		if (previous && !current) {
			this._onDidChangeSessions.fire({ added: undefined, removed: [previous], changed: undefined });
		} else if (!previous && current) {
			this._onDidChangeSessions.fire({ added: [current], removed: undefined, changed: undefined });
		} else if (previous && current) {
			this._onDidChangeSessions.fire({ added: undefined, removed: undefined, changed: [current] });
		}
	}

	private async currentSession(): Promise<AuthenticationSession | undefined> {
		const account = this.accountService.account;
		if (this.accountService.state !== EmberAccountState.SignedIn || !account) {
			return undefined;
		}
		try {
			return toSession(account, await this.accountService.getAccessToken());
		} catch (error) {
			// A refresh that fails here is surfaced by the account service
			// itself; the Accounts menu just shows no Ember account meanwhile.
			this.logService.warn('[ember-account] could not resolve a session for the Accounts menu', error);
			return undefined;
		}
	}

	async getSessions(): Promise<readonly AuthenticationSession[]> {
		const session = await this.currentSession();
		return session ? [session] : [];
	}

	async createSession(): Promise<AuthenticationSession> {
		const session = await this.currentSession();
		if (!session) {
			throw new Error(`Sign in to ${this.label} from the sign-in screen.`);
		}
		return session;
	}

	async removeSession(): Promise<void> {
		await this.accountService.signOut();
	}
}

function toSession(account: IEmberAccount, accessToken: string): AuthenticationSession {
	return {
		id: account.id,
		accessToken,
		account: {
			id: account.id,
			label: account.email ?? account.displayName ?? account.id,
			icon: account.avatarUrl ? URI.parse(account.avatarUrl) : undefined,
		},
		scopes: [],
	};
}

export class EmberAuthenticationProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.emberAuthenticationProvider';

	constructor(
		@IEmberAccountService accountService: IEmberAccountService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
	) {
		super();

		if (!isAccountBackendConfigured(productService.emberAccount)) {
			return;
		}

		const provider = this._register(new EmberAuthenticationProvider(productService.nameShort, accountService, logService));
		authenticationService.registerAuthenticationProvider(provider.id, provider);
		this._register(toDisposable(() => authenticationService.unregisterAuthenticationProvider(provider.id)));
	}
}
