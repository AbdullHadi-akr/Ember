/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IEmberAccountProvider } from '../../../../base/common/product.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EmberAccountState } from './emberAuthGate.js';

export const IEmberAccountService = createDecorator<IEmberAccountService>('emberAccountService');

/** The signed-in user, as reported by the account backend. */
export interface IEmberAccount {
	readonly id: string;
	readonly email?: string;
	readonly displayName?: string;
	readonly avatarUrl?: string;
}

export interface IEmberAccountService {
	readonly _serviceBrand: undefined;

	/**
	 * Current resolution state. Starts {@link EmberAccountState.Unresolved} and
	 * only becomes meaningful once stored credentials have been read back.
	 */
	readonly state: EmberAccountState;

	/** The signed-in account, or `undefined` when not signed in or unresolved. */
	readonly account: IEmberAccount | undefined;

	readonly onDidChangeState: Event<EmberAccountState>;

	/** Providers offered on the sign-in gate; empty when no backend is configured. */
	readonly providers: readonly IEmberAccountProvider[];

	/**
	 * Starts an OAuth sign-in with the given provider. Opens the system browser
	 * and resolves once the callback has been redeemed, or rejects if the flow
	 * fails or is superseded by another sign-in attempt.
	 */
	signIn(providerId: string): Promise<void>;

	/** Clears the stored session. */
	signOut(): Promise<void>;

	/**
	 * A valid access token for calling the backend, refreshing it first if it is
	 * close to expiry. Rejects when not signed in.
	 */
	getAccessToken(): Promise<string>;
}
