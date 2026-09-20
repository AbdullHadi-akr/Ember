/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEmberAccountConfiguration } from '../../../../base/common/product.js';

/**
 * Whether the sign-in gate should cover the workbench.
 *
 * The state that matters here is {@link Unresolved}. On startup the stored
 * refresh token has not been read back from secret storage yet, so the account
 * is neither known-present nor known-absent. Collapsing that into "signed out"
 * flashes the gate at a returning user for the length of one async read, and
 * nothing retires it cleanly once the session resolves. Consumers must render
 * nothing while unresolved rather than guessing.
 */
export const enum EmberAccountState {
	/** Secret storage has not been read yet — show neither the gate nor the workbench. */
	Unresolved,
	/** A session is available (or was refreshed successfully). */
	SignedIn,
	/** Resolved, and there is no usable session. */
	SignedOut,
}

/** What the workbench should display for a given account state. */
export const enum EmberGateVisibility {
	/** Hold: resolution is still in flight. */
	Hold,
	/** Cover the workbench with the sign-in gate. */
	ShowGate,
	/** Let the workbench through. */
	ShowWorkbench,
}

/**
 * Resolves what to show. A build with no `emberAccount` block in product.json
 * has no backend to sign in to, so it must never gate — otherwise an
 * unconfigured fork is unusable.
 */
export function resolveGateVisibility(state: EmberAccountState, configuration: IEmberAccountConfiguration | undefined): EmberGateVisibility {
	if (!isAccountBackendConfigured(configuration)) {
		return EmberGateVisibility.ShowWorkbench;
	}
	switch (state) {
		case EmberAccountState.Unresolved: return EmberGateVisibility.Hold;
		case EmberAccountState.SignedIn: return EmberGateVisibility.ShowWorkbench;
		case EmberAccountState.SignedOut: return EmberGateVisibility.ShowGate;
	}
}

/**
 * Whether a usable account backend is configured. An empty `providers` list is
 * treated as unconfigured: the gate would otherwise render with no way out.
 */
export function isAccountBackendConfigured(configuration: IEmberAccountConfiguration | undefined): configuration is IEmberAccountConfiguration {
	return !!configuration
		&& !!configuration.url
		&& !!configuration.anonKey
		&& configuration.providers.length > 0;
}

/**
 * The OAuth redirect target, split the way a URI actually parses.
 *
 * `ember://auth/callback` yields authority `auth` and path `/callback` — not a
 * path of `/auth/callback`. Building the redirect in one place and matching it
 * in another is how that gets mismatched, and the failure is silent: the
 * callback is ignored and the pending sign-in never settles. Both sides derive
 * from these constants so they cannot drift apart.
 */
const CALLBACK_AUTHORITY = 'auth';
const CALLBACK_PATH = '/callback';

/** The `redirect_to` value to hand the provider, e.g. `ember://auth/callback`. */
export function buildAuthRedirectUrl(urlProtocol: string): string {
	return `${urlProtocol}://${CALLBACK_AUTHORITY}${CALLBACK_PATH}`;
}

/** Whether an incoming URI is our OAuth callback. */
export function isAuthCallbackUri(authority: string, path: string): boolean {
	return authority.toLowerCase() === CALLBACK_AUTHORITY
		&& path.replace(/\/+$/, '').toLowerCase() === CALLBACK_PATH;
}

/**
 * API path prefixes that belong to a Supabase project but are *not* the project
 * URL. The dashboard shows fully-qualified endpoints alongside the project URL,
 * so pasting one of these is an easy mistake — and a costly one: appending the
 * auth path to `…/rest/v1` lands on PostgREST, which answers any request without
 * an `apikey` header with "No API key found in request". The browser opening an
 * authorization URL sends no headers, so the user sees that error instead of a
 * login page, with nothing pointing at the real cause.
 */
const API_PATH_SUFFIXES = ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1', '/realtime/v1'];

/**
 * Normalizes a configured account URL down to the project origin.
 *
 * Strips trailing slashes and any trailing Supabase API path, so that
 * `https://ref.supabase.co/rest/v1/` and `https://ref.supabase.co` behave the
 * same. Returns the normalized URL plus whether a path was removed, so the
 * caller can warn rather than silently accepting a misconfiguration.
 */
export function normalizeAccountUrl(url: string): { readonly url: string; readonly strippedPath?: string } {
	let normalized = url.trim().replace(/\/+$/, '');
	for (const suffix of API_PATH_SUFFIXES) {
		if (normalized.toLowerCase().endsWith(suffix)) {
			return { url: normalized.slice(0, -suffix.length).replace(/\/+$/, ''), strippedPath: suffix };
		}
	}
	return { url: normalized };
}

/**
 * Whether an access token should be treated as expired. `expiresAt` is epoch
 * seconds, as issued by Supabase.
 *
 * The skew matters: a token that expires during the request it is attached to
 * fails server-side, and the caller sees an opaque 401 rather than a refresh.
 * Renewing slightly early is cheap; discovering expiry mid-flight is not.
 */
export function isAccessTokenExpired(expiresAt: number | undefined, nowMs: number, skewSeconds = 60): boolean {
	if (expiresAt === undefined) {
		return true;
	}
	return expiresAt - skewSeconds <= Math.floor(nowMs / 1000);
}

/**
 * Validates the OAuth callback before any token exchange.
 *
 * Deliberately without a `state` comparison. `state` is reserved by Supabase:
 * the authorize endpoint ignores a client-supplied one and passes its own
 * flow-state id to the provider, so nothing of ours comes back on
 * `redirect_to` — only `code`, or an `error`. Requiring a match rejects every
 * real callback.
 *
 * PKCE carries that binding instead. The code verifier never leaves this
 * process, and the auth code is tied to the flow state holding our challenge,
 * so a code injected over the URL protocol — which any local process can
 * invoke — cannot be redeemed. What is still worth checking is that a sign-in
 * is actually pending, so an unsolicited callback is dropped rather than
 * exchanged.
 */
export function parseAuthCallback(query: string, hasPendingRequest: boolean): { readonly code: string } | { readonly error: string } {
	const params = new URLSearchParams(query);

	const error = params.get('error_description') ?? params.get('error');
	if (error) {
		return { error };
	}

	if (!hasPendingRequest) {
		return { error: 'Sign-in response did not match the pending request.' };
	}

	const code = params.get('code');
	if (!code) {
		return { error: 'Sign-in response carried no authorization code.' };
	}

	return { code };
}
