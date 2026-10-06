import { ASSIGN_ACTIONS } from './assign';
import { CABLE_ACTIONS } from './cables';
import { CLIPBOARD_ACTIONS } from './clipboard';
import type { ActionDef } from './ctx';
import { LOAD_ACTIONS } from './load';
import { MODULE_ACTIONS } from './modules';
import { MORPH_ACTIONS } from './morph';
import { PARAM_ACTIONS } from './params';
import { PATCH_ACTIONS } from './patch';
import { PERF_ACTIONS } from './perf';
import { VARIATION_ACTIONS } from './variations';

/**
 * Every editor action the duration test exercises. Excluded on purpose (stored or global G2 data):
 * store/clear patch, clear bank, send-bank, Synth Settings, delete-unused-modules/cables, dump-one.
 */
export const ACTIONS: ActionDef[] = [
	...MODULE_ACTIONS,
	...CABLE_ACTIONS,
	...PARAM_ACTIONS,
	...MORPH_ACTIONS,
	...ASSIGN_ACTIONS,
	...VARIATION_ACTIONS,
	...PATCH_ACTIONS,
	...PERF_ACTIONS,
	...CLIPBOARD_ACTIONS,
	...LOAD_ACTIONS,
];
