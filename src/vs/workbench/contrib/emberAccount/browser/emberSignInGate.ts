/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEmberAccountService } from '../../../services/emberAccount/common/emberAccount.js';
import { EmberGateVisibility, resolveGateVisibility } from '../../../services/emberAccount/common/emberAuthGate.js';
import { renderSignInCard } from './emberSignInCard.js';

/**
 * Covers the workbench until an account is signed in.
 *
 * The gate renders only once the account service has *resolved* — see
 * {@link EmberGateVisibility.Hold}. Rendering on the unresolved state would show
 * the gate to a returning user for the length of one secret-storage read.
 */
export class EmberSignInGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.emberSignInGate';

	private overlay: HTMLElement | undefined;
	private readonly cardDisposables = this._register(new MutableDisposable<DisposableStore>());
	private busy: 'browser' | 'password' | undefined;
	private error: string | undefined;
	/** Kept across re-renders so a failed attempt does not wipe the typed email. */
	private email = '';

	constructor(
		@IEmberAccountService private readonly accountService: IEmberAccountService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.accountService.onDidChangeState(() => this.update()));
		this.update();
	}

	private update(): void {
		const visibility = resolveGateVisibility(this.accountService.state, this.productService.emberAccount);
		if (visibility === EmberGateVisibility.ShowGate) {
			this.show();
		} else {
			this.hide();
		}
	}

	private show(): void {
		if (!this.overlay) {
			this.overlay = append(this.layoutService.activeContainer, $('.ember-signin-gate'));
			this.overlay.setAttribute('role', 'dialog');
			this.overlay.setAttribute('aria-modal', 'true');
			this.overlay.setAttribute('aria-label', localize('ember.signIn.aria', "Sign in to {0}", this.productService.nameLong));
		}
		this.render();
	}

	private hide(): void {
		this.cardDisposables.clear();
		this.overlay?.remove();
		this.overlay = undefined;
	}

	private render(focusPassword = false): void {
		const overlay = this.overlay;
		if (!overlay) {
			return;
		}
		this.cardDisposables.value = renderSignInCard(overlay, {
			productName: this.productService.nameLong,
			providers: this.accountService.providers,
			emailSignIn: this.accountService.emailSignInEnabled,
			email: this.email,
			busy: this.busy,
			error: this.error,
			onSignIn: providerId => this.run('browser', () => this.accountService.signIn(providerId)),
			onEmailSignIn: (email, password) => this.run('password', () => this.accountService.signInWithPassword(email, password)),
			onEmailChange: email => this.email = email
		});

		// Hold focus inside the gate: nothing behind it is actionable. After a
		// rejected password, land back in the field that needs retyping.
		const focusTarget = focusPassword
			? overlay.querySelector<HTMLElement>('.ember-signin-email input[type="password"]')
			: overlay.querySelector<HTMLElement>('.monaco-button');
		focusTarget?.focus();
	}

	private async run(kind: 'browser' | 'password', signIn: () => Promise<void>): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = kind;
		this.error = undefined;
		this.render();

		try {
			await signIn();
			// Success flips the service state, which retires the gate through
			// update() — nothing to do here.
		} catch (error) {
			this.logService.warn('[ember-account] sign-in failed', error);
			this.error = error instanceof Error
				? error.message
				: localize('ember.signIn.failed', "Sign-in did not complete. Please try again.");
		} finally {
			this.busy = undefined;
			if (this.overlay) {
				this.render(kind === 'password' && !!this.error);
			}
		}
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
