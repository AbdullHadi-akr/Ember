/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../contrib/emberAccount/browser/media/emberSignInGate.css';

import * as dom from '../../../../base/browser/dom.js';
import { IEmberAccountProvider } from '../../../../base/common/product.js';
import { renderSignInCard } from '../../../contrib/emberAccount/browser/emberSignInCard.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

const providers: readonly IEmberAccountProvider[] = [
	{ id: 'github', label: 'GitHub' }
];

export default defineThemedFixtureGroup({ path: 'emberAccount/' }, {
	SignInGate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A centred card on an opaque ground: the Ember app mark, a "Welcome to Ember" heading, one line of explanatory text, a full-width "Continue with GitHub" button, an "or" divider, Email and Password fields above a secondary "Sign in with Email" button, and a closing hint that new accounts are created with GitHub while email sign-in is for existing accounts.'],
		render: context => renderGate(context, {}),
	}),

	SignInGateBusy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with the GitHub button, both fields and the email button dimmed and unclickable, and a status line reading that it is waiting for the browser to complete sign-in.'],
		render: context => renderGate(context, { busy: 'browser' }),
	}),

	SignInGateEmailBusy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with the email field prefilled, everything dimmed and unclickable, and a status line reading "Signing in…".'],
		render: context => renderGate(context, { busy: 'password', email: 'user@example.com' }),
	}),

	SignInGateError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with the email field prefilled, the controls active again and, below them, a bordered error box carrying the failure message.'],
		render: context => renderGate(context, { email: 'user@example.com', error: 'Invalid login credentials' }),
	}),

	SignInGateOAuthOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with no divider or email form: only the "Continue with GitHub" button and a closing hint that a browser window will open.'],
		render: context => renderGate(context, { emailSignIn: false }),
	}),
});

function renderGate(
	context: ComponentFixtureContext,
	overrides: { busy?: 'browser' | 'password'; error?: string; email?: string; emailSignIn?: boolean; providers?: readonly IEmberAccountProvider[] }
): void {
	const gate = dom.append(context.container, dom.$('.ember-signin-gate'));
	// The real gate is fixed to the viewport; inside a fixture host it must lay
	// out in flow, or it would escape the captured region.
	gate.style.position = 'relative';
	gate.style.minHeight = '460px';

	context.disposableStore.add(renderSignInCard(gate, {
		productName: 'Ember',
		providers: overrides.providers ?? providers,
		emailSignIn: overrides.emailSignIn ?? true,
		email: overrides.email,
		busy: overrides.busy,
		error: overrides.error,
		onSignIn: () => { /* inert in a fixture */ },
		onEmailSignIn: () => { /* inert in a fixture */ }
	}));
}
