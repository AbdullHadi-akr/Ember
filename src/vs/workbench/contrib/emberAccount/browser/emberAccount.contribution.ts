/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emberSignInGate.css';

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEmberAccountService } from '../../../services/emberAccount/common/emberAccount.js';
import { EmberSignInGate } from './emberSignInGate.js';

// The gate must be up before anything behind it becomes reachable, so it runs
// in the phase that blocks an editor from showing rather than a later one.
registerWorkbenchContribution2(EmberSignInGate.ID, EmberSignInGate, WorkbenchPhase.BlockStartup);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'ember.account.signOut',
			title: localize2('ember.account.signOut', "Sign Out"),
			category: localize2('ember.account.category', "Ember Account"),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IEmberAccountService).signOut();
	}
});
