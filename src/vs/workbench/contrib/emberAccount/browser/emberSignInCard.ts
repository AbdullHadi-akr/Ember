/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEmberAccountProvider } from '../../../../base/common/product.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';

export interface ISignInCardOptions {
	readonly productName: string;
	readonly providers: readonly IEmberAccountProvider[];
	/** A sign-in is in flight; buttons are disabled and a status line is shown. */
	readonly busy: boolean;
	/** Message from a failed attempt, announced to assistive technology. */
	readonly error?: string;
	readonly onSignIn: (providerId: string) => void;
}

/**
 * Renders the sign-in card into `parent`, replacing whatever was there.
 *
 * Kept free of workbench services so the card can be rendered by a component
 * fixture exactly as the gate renders it, rather than a lookalike.
 */
export function renderSignInCard(parent: HTMLElement, options: ISignInCardOptions): DisposableStore {
	const store = new DisposableStore();
	clearNode(parent);

	const card = append(parent, $('.ember-signin-card'));

	append(card, $('.ember-signin-mark')).setAttribute('aria-hidden', 'true');

	append(card, $('h1.ember-signin-title')).textContent =
		localize('ember.signIn.title', "Welcome to {0}", options.productName);
	append(card, $('p.ember-signin-subtitle')).textContent =
		localize('ember.signIn.subtitle', "Sign in to continue. Your workspace and AI context stay linked to your account.");

	const actions = append(card, $('.ember-signin-actions'));
	for (const provider of options.providers) {
		const button = store.add(new Button(actions, { ...defaultButtonStyles, title: provider.label }));
		button.label = localize('ember.signIn.with', "Continue with {0}", provider.label);
		button.enabled = !options.busy;
		store.add(button.onDidClick(() => options.onSignIn(provider.id)));
	}

	if (options.busy) {
		const status = append(card, $('.ember-signin-status'));
		status.setAttribute('role', 'status');
		status.textContent = localize('ember.signIn.waiting', "Waiting for the browser to complete sign-in…");
	}

	if (options.error) {
		const error = append(card, $('.ember-signin-error'));
		// Announced, not just coloured: colour alone never reaches a screen
		// reader, and a failed sign-in is a dead end on this screen.
		error.setAttribute('role', 'alert');
		error.textContent = options.error;
	}

	append(card, $('.ember-signin-hint')).textContent =
		localize('ember.signIn.hint', "A browser window will open to complete sign-in.");

	return store;
}
