/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEmberAccountConfiguration } from '../../../../../base/common/product.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	EmberAccountState,
	EmberGateVisibility,
	buildAuthRedirectUrl,
	isAccessTokenExpired,
	isAccountBackendConfigured,
	isAuthCallbackUri,
	normalizeAccountUrl,
	parseAuthCallback,
	resolveGateVisibility
} from '../../common/emberAuthGate.js';

/** Feeds a parsed URI into {@link isAuthCallbackUri}. */
const split = (uri: URI): [string, string] => [uri.authority, uri.path];

const configured: IEmberAccountConfiguration = {
	url: 'https://example.supabase.co',
	anonKey: 'anon-key',
	providers: [{ id: 'github', label: 'GitHub' }]
};

suite('EmberAuthGate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('gate visibility across account states', () => {
		assert.deepStrictEqual({
			unresolved: resolveGateVisibility(EmberAccountState.Unresolved, configured),
			signedOut: resolveGateVisibility(EmberAccountState.SignedOut, configured),
			signedIn: resolveGateVisibility(EmberAccountState.SignedIn, configured),
			// An unconfigured build has nothing to sign in to and must not gate.
			noBackend: resolveGateVisibility(EmberAccountState.SignedOut, undefined),
			noProviders: resolveGateVisibility(EmberAccountState.SignedOut, { ...configured, providers: [] }),
		}, {
			unresolved: EmberGateVisibility.Hold,
			signedOut: EmberGateVisibility.ShowGate,
			signedIn: EmberGateVisibility.ShowWorkbench,
			noBackend: EmberGateVisibility.ShowWorkbench,
			noProviders: EmberGateVisibility.ShowWorkbench,
		});
	});

	test('backend configuration is only complete with url, key and a provider', () => {
		assert.deepStrictEqual({
			complete: isAccountBackendConfigured(configured),
			undefinedConfig: isAccountBackendConfigured(undefined),
			noUrl: isAccountBackendConfigured({ ...configured, url: '' }),
			noKey: isAccountBackendConfigured({ ...configured, anonKey: '' }),
			noProviders: isAccountBackendConfigured({ ...configured, providers: [] }),
		}, {
			complete: true,
			undefinedConfig: false,
			noUrl: false,
			noKey: false,
			noProviders: false,
		});
	});

	test('the redirect url it builds is the one it matches back', () => {
		// The regression this pins: `ember://auth/callback` parses to authority
		// `auth` and path `/callback`, NOT a path of `/auth/callback`. Matching
		// on the joined string silently drops every callback, and the pending
		// sign-in then never settles.
		const redirect = buildAuthRedirectUrl('ember');
		const parsed = URI.parse(redirect);

		assert.deepStrictEqual({
			redirect,
			authority: parsed.authority,
			path: parsed.path,
			matchesOwnRedirect: isAuthCallbackUri(parsed.authority, parsed.path),
			withQuery: isAuthCallbackUri(...split(URI.parse(`${redirect}?code=a&state=b`))),
			trailingSlash: isAuthCallbackUri('auth', '/callback/'),
			wrongPath: isAuthCallbackUri('auth', '/auth/callback'),
			otherAuthority: isAuthCallbackUri('workspace', '/callback'),
		}, {
			redirect: 'ember://auth/callback',
			authority: 'auth',
			path: '/callback',
			matchesOwnRedirect: true,
			withQuery: true,
			trailingSlash: true,
			wrongPath: false,
			otherAuthority: false,
		});
	});

	test('account url is normalized to the project origin', () => {
		const origin = 'https://ref.supabase.co';
		assert.deepStrictEqual({
			plain: normalizeAccountUrl(origin),
			trailingSlash: normalizeAccountUrl(`${origin}/`),
			manySlashes: normalizeAccountUrl(`${origin}///`),
			whitespace: normalizeAccountUrl(`  ${origin}  `),
			// Pasting an API endpoint instead of the project URL sends the
			// authorization request to PostgREST, whose "No API key found in
			// request" reply names nothing that points back at this setting.
			rest: normalizeAccountUrl(`${origin}/rest/v1/`),
			auth: normalizeAccountUrl(`${origin}/auth/v1`),
			storage: normalizeAccountUrl(`${origin}/storage/v1`),
			uppercase: normalizeAccountUrl(`${origin}/REST/V1`),
			// A self-hosted project may legitimately sit under a path prefix.
			customPath: normalizeAccountUrl('https://example.com/supabase'),
		}, {
			plain: { url: origin },
			trailingSlash: { url: origin },
			manySlashes: { url: origin },
			whitespace: { url: origin },
			rest: { url: origin, strippedPath: '/rest/v1' },
			auth: { url: origin, strippedPath: '/auth/v1' },
			storage: { url: origin, strippedPath: '/storage/v1' },
			uppercase: { url: origin, strippedPath: '/rest/v1' },
			customPath: { url: 'https://example.com/supabase' },
		});
	});

	test('access token expiry honours the renewal skew', () => {
		const now = 1_000_000_000_000; // epoch seconds: 1_000_000_000
		assert.deepStrictEqual({
			missing: isAccessTokenExpired(undefined, now),
			longValid: isAccessTokenExpired(1_000_000_600, now),
			// Inside the 60s skew: renew now rather than fail mid-request.
			withinSkew: isAccessTokenExpired(1_000_000_030, now),
			exactlyAtSkew: isAccessTokenExpired(1_000_000_060, now),
			alreadyPast: isAccessTokenExpired(999_999_000, now),
		}, {
			missing: true,
			longValid: false,
			withinSkew: true,
			exactlyAtSkew: true,
			alreadyPast: true,
		});
	});

	test('callback is redeemed only while a sign-in is pending', () => {
		assert.deepStrictEqual({
			// What Supabase actually sends back: a bare code, no state of ours.
			match: parseAuthCallback('code=abc', true),
			// A stray state must not disqualify an otherwise valid callback.
			foreignState: parseAuthCallback('code=abc&state=whatever', true),
			// The protocol is invocable by any local process, so a callback that
			// nobody asked for must never be exchanged.
			noPending: parseAuthCallback('code=abc', false),
			missingCode: parseAuthCallback('', true),
			// A provider error is reported even without a pending request.
			providerError: parseAuthCallback('error=access_denied&error_description=User+declined', false),
		}, {
			match: { code: 'abc' },
			foreignState: { code: 'abc' },
			noPending: { error: 'Sign-in response did not match the pending request.' },
			missingCode: { error: 'Sign-in response carried no authorization code.' },
			providerError: { error: 'User declined' },
		});
	});
});
