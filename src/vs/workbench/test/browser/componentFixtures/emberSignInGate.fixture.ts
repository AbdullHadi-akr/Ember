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
	{ id: 'github', label: 'GitHub' },
	{ id: 'google', label: 'Google' }
];

export default defineThemedFixtureGroup({ path: 'emberAccount/' }, {
	SignInGate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A centred card on an opaque ground: the Ember app mark, a "Welcome to Ember" heading, one line of explanatory text, two full-width buttons reading "Continue with GitHub" and "Continue with Google", and a closing hint that a browser window will open.'],
		render: context => renderGate(context, {}),
	}),

	SignInGateBusy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with both provider buttons dimmed and unclickable, and a status line reading that it is waiting for the browser to complete sign-in.'],
		render: context => renderGate(context, { busy: true }),
	}),

	SignInGateError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card with the buttons active again and, below them, a bordered error box carrying the failure message.'],
		render: context => renderGate(context, { error: 'Sign-in response did not match the pending request.' }),
	}),

	SignInGateSingleProvider: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same card offering only one button, reading "Continue with GitHub".'],
		render: context => renderGate(context, { providers: providers.slice(0, 1) }),
	}),
});

function renderGate(
	context: ComponentFixtureContext,
	overrides: { busy?: boolean; error?: string; providers?: readonly IEmberAccountProvider[] }
): void {
	const gate = dom.append(context.container, dom.$('.ember-signin-gate'));
	// The real gate is fixed to the viewport; inside a fixture host it must lay
	// out in flow, or it would escape the captured region.
	gate.style.position = 'relative';
	gate.style.minHeight = '460px';

	context.disposableStore.add(renderSignInCard(gate, {
		productName: 'Ember',
		providers: overrides.providers ?? providers,
		busy: overrides.busy ?? false,
		error: overrides.error,
		onSignIn: () => { /* inert in a fixture */ }
	}));
}
