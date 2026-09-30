/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEmberAccountProvider } from '../../../../base/common/product.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';

export interface ISignInCardOptions {
	readonly productName: string;
	readonly providers: readonly IEmberAccountProvider[];
	/** Offer the email/password form for existing accounts. */
	readonly emailSignIn: boolean;
	/** Email to prefill, so a re-render after a failed attempt keeps it. */
	readonly email?: string;
	/**
	 * A sign-in is in flight; inputs are disabled and a status line is shown.
	 * `browser` waits on an OAuth callback, `password` on the token request.
	 */
	readonly busy?: 'browser' | 'password';
	/** Message from a failed attempt, announced to assistive technology. */
	readonly error?: string;
	readonly onSignIn: (providerId: string) => void;
	readonly onEmailSignIn: (email: string, password: string) => void;
	readonly onEmailChange?: (email: string) => void;
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

	if (options.providers.length > 0) {
		const actions = append(card, $('.ember-signin-actions'));
		for (const provider of options.providers) {
			const button = store.add(new Button(actions, { ...defaultButtonStyles, title: provider.label }));
			button.label = localize('ember.signIn.with', "Continue with {0}", provider.label);
			button.enabled = !options.busy;
			store.add(button.onDidClick(() => options.onSignIn(provider.id)));
		}
	}

	if (options.emailSignIn) {
		if (options.providers.length > 0) {
			append(card, $('.ember-signin-divider')).textContent = localize('ember.signIn.or', "or");
		}
		renderEmailForm(card, options, store);
	}

	if (options.busy) {
		const status = append(card, $('.ember-signin-status'));
		status.setAttribute('role', 'status');
		status.textContent = options.busy === 'browser'
			? localize('ember.signIn.waiting', "Waiting for the browser to complete sign-in…")
			: localize('ember.signIn.signingIn', "Signing in…");
	}

	if (options.error) {
		const error = append(card, $('.ember-signin-error'));
		// Announced, not just coloured: colour alone never reaches a screen
		// reader, and a failed sign-in is a dead end on this screen.
		error.setAttribute('role', 'alert');
		error.textContent = options.error;
	}

	if (options.providers.length > 0) {
		append(card, $('.ember-signin-hint')).textContent = options.emailSignIn
			// Email is sign-in only, so say where new accounts come from rather
			// than leave a first-time visitor hunting for a sign-up link.
			? localize('ember.signIn.hint.signUp', "New here? Create your account with {0}. Email sign-in is for existing accounts.", options.providers.map(provider => provider.label).join(', '))
			: localize('ember.signIn.hint', "A browser window will open to complete sign-in.");
	}

	return store;
}

function renderEmailForm(card: HTMLElement, options: ISignInCardOptions, store: DisposableStore): void {
	const form = append(card, $('.ember-signin-email'));

	const email = store.add(new InputBox(form, undefined, {
		type: 'email',
		placeholder: localize('ember.signIn.email', "Email"),
		ariaLabel: localize('ember.signIn.email', "Email"),
		inputBoxStyles: defaultInputBoxStyles,
	}));
	email.inputElement.autocomplete = 'username';
	email.value = options.email ?? '';

	const password = store.add(new InputBox(form, undefined, {
		type: 'password',
		placeholder: localize('ember.signIn.password', "Password"),
		ariaLabel: localize('ember.signIn.password', "Password"),
		inputBoxStyles: defaultInputBoxStyles,
	}));
	password.inputElement.autocomplete = 'current-password';

	const submit = store.add(new Button(form, { ...defaultButtonStyles, secondary: true }));
	submit.label = localize('ember.signIn.withEmail', "Sign in with Email");

	const canSubmit = () => !options.busy && email.value.trim().length > 0 && password.value.length > 0;
	const updateSubmit = () => submit.enabled = canSubmit();
	const trySubmit = () => {
		if (canSubmit()) {
			options.onEmailSignIn(email.value.trim(), password.value);
		}
	};

	if (options.busy) {
		email.disable();
		password.disable();
	}
	updateSubmit();

	store.add(email.onDidChange(value => {
		options.onEmailChange?.(value);
		updateSubmit();
	}));
	store.add(password.onDidChange(() => updateSubmit()));
	store.add(submit.onDidClick(() => trySubmit()));

	for (const input of [email.inputElement, password.inputElement]) {
		store.add(addDisposableListener(input, EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Enter)) {
				e.preventDefault();
				trySubmit();
			}
		}));
	}
}
