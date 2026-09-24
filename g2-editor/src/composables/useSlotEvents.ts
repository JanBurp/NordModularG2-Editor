import { DeviceStatus, useDeviceStore } from '@/store/device';

import type { LogFn } from './useG2';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import type { SlotLabel } from '@/types';
import { ref } from 'vue';
import { resolveParamEcho, useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

export function useSlotEvents(log: LogFn) {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const hardwareVariationChange = ref<{ slot: SlotLabel; variation: number } | null>(null);
	const hardwareSlotChange = ref<SlotLabel | null>(null);
	const pendingSlotReload = new Set<SlotLabel>();
	const pendingResourceFetch = new Set<SlotLabel>();
	let keyFocusTimer: ReturnType<typeof setTimeout> | null = null;

	/* The G2 doesn't reliably emit a watch event after a software slot switch
	 * (it depends on whether the target slot was already active), so we can't
	 * key off a specific event without risking a stale/misfired command later.
	 * A short debounced delay gives the device time to settle instead. */
	function requestKeyFocus(slot: SlotLabel, previouslyKeyed: SlotLabel[]): void {
		if (keyFocusTimer) clearTimeout(keyFocusTimer);
		keyFocusTimer = setTimeout(async () => {
			keyFocusTimer = null;
			if (store.status !== DeviceStatus.Connected) return;
			try {
				for (const sl of previouslyKeyed) await window.cli.run(['set-slot-key', sl, '0']);
				await window.cli.run(['set-slot-key', slot, '1']);
			} catch {
				/* device may have disconnected mid-debounce; state resyncs on next event */
			}
		}, 100);
	}

	async function fetchSlotResources(slot: SlotLabel): Promise<void> {
		if (store.status !== DeviceStatus.Connected) return;
		if (pendingResourceFetch.has(slot)) return;
		pendingResourceFetch.add(slot);
		try {
			const out = await window.cli.run(['get-resources', slot]);
			const parsed = JSON.parse(out);
			if (Array.isArray(parsed)) slotsStore.updateResources(slot, parsed);
		} catch {
			// patch may not be loaded in this slot
		} finally {
			pendingResourceFetch.delete(slot);
		}
	}

	async function handleEvent(ev: any): Promise<boolean> {
		if (ev.type === 'slot_data') {
			log('←', 'Watch', `slot_data slot=${ev.slot}`);
			if (ev.data && ev.data.data && !slotsStore.slots[ev.slot as SlotLabel]?.loading) {
				try {
					await slotsStore._applyPatchOutput(ev.slot as SlotLabel, JSON.stringify(ev.data));
				} catch (e) {
					console.error(`Failed to apply patch data for slot ${ev.slot}:`, e);
				}
			}
			return true;
		}
		if (ev.type === 'copy_variation') {
			slotsStore.handleCopyVariationEvent(ev.slot as SlotLabel, ev.from as number, ev.to as number);
			log('←', 'Watch', `copy_variation slot=${ev.slot} from=${ev.from} to=${ev.to}`);
			return true;
		}
		if (ev.type === 'variation_change') {
			const sl = ev.slot as SlotLabel;
			if (sl) hardwareVariationChange.value = { slot: sl, variation: ev.variation as number };
			log('←', 'Watch', `var ${ev.variation + 1} slot=${ev.slot}`);
			return true;
		}
		if (ev.type === 'slot_change') {
			const sl = ev.slot as SlotLabel;
			hardwareSlotChange.value = sl ?? null;
			log('←', 'Watch', `slot → ${ev.slot}`);
			// Refresh actual slot state (key, active) from G2 — slot_change alone
			// doesn't carry full info since multiple slots can hold key=true.
			if (sl && store.status === DeviceStatus.Connected) {
				try {
					const raw = await window.cli.run(['get-perf-settings']);
					const parsed = JSON.parse(raw);
					store.updatePerfSettings(parsed.data ?? parsed);
				} catch {
					/* state will sync on next perf_settings event */
				}
			}
			return true;
		}
		if (ev.type === 'param_change') {
			log('←', 'Watch', `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`, 'param');
			resolveParamEcho(`${ev.slot}:${ev.area}:${ev.module}:${ev.param}:${ev.variation}`, ev.value as number);
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			const areaKey = ev.area === 'va' ? 'voice' : 'fx';
			const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
			if (vState?.[areaKey]?.[ev.module as number]) {
				vState[areaKey][ev.module as number][ev.param as number] = ev.value;
				slotsStore._markSlotDirty(slotLabel);
			}
			// The G2's own onboard Rnd/Clr (see slots.ts's comment) ignores this editor's piano-roll
			// window; since we never send this trigger param ourselves, any incoming press must be a
			// physical button — correct it immediately with a windowed recompute.
			slotsStore.maybeCorrectHardwareRndOrClr(slotLabel, ev.module as number, ev.param as number, ev.value as number, ev.variation as number, areaKey);
			return true;
		}
		if (ev.type === 'selected_param') {
			log('←', 'Watch', `selected_param slot=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param}`);
			const sl = ev.slot as SlotLabel;
			// Selection is a single global (not per-slot), and only meaningful for the slot
			// currently in view; the 'patch' context (Master Clock section) has no on-canvas
			// module grid to select in this editor.
			if (sl !== uiStore.slotInFocus || ev.area === 'patch') return true;
			const area: 0 | 1 = ev.area === 'va' ? 1 : 0;
			const moduleId = ev.module as number;
			if (slotsStore.getAreaModules(sl, area).some((m: any) => m.index === moduleId)) {
				uiStore.selectModules([moduleId], area === 1 ? 'va' : 'fx');
				uiStore.setSelectedParam(moduleId, ev.param as number);
			}
			return true;
		}
		if (ev.type === 'param_page_change') {
			log('←', 'Watch', `param_page_change slot=${ev.slot} page=${ev.page}`);
			// One byte packs both selectors: page = byte/3 (A-E), bank = byte%3 (1-3). This opcode
			// (0x2D) turns out to be SHARED between Patch and Global page display — like 0x3F's
			// run/bpm/source sub-modes, the hardware reports "the displayed page changed" once and
			// relies on the already-known current source (uiStore.globalPagesActive, tracked via
			// knob_source_change) to disambiguate, rather than always sending the separate
			// global_page_change (0x1E) echo. Confirmed 2026-08-28: front-panel page buttons
			// pressed while in Global mode landed here, not in global_page_change — this handler
			// previously force-set Patch mode on every receipt, silently reverting the toggle the
			// instant a page changed while actually in Global mode. Values >= 15 are out of range —
			// the device's own decoder ignores them, so we do too.
			const page = ev.page as number;
			if (page > 14) return true;
			if (uiStore.globalPagesActive) {
				// Global page/bank isn't slot-scoped — accept regardless of which slot is in view.
				uiStore.setDisplayedGlobalParamPage(Math.floor(page / 3));
				uiStore.setSelectedGlobalParamBank(page % 3);
				return true;
			}
			// Patch page/bank is a single global (not per-slot) view, so only the slot currently in
			// view may move it — same reasoning as selected_param above.
			if (ev.slot !== uiStore.slotInFocus) return true;
			uiStore.setDisplayedParamPage(Math.floor(page / 3));
			uiStore.setSelectedParamBank(page % 3);
			return true;
		}
		if (ev.type === 'global_page_change') {
			log('←', 'Watch', `global_page_change slot=${ev.slot} page=${ev.page}`);
			// Global Parameter Pages sibling of param_page_change above. Not slot-gated the way that
			// one is — the toolbar's Global Pages bank/page is a single global view regardless of
			// which slot's canvas is in focus, since a Global Pages entry can target any of the 4
			// slots.
			const page = ev.page as number;
			if (page > 14) return true;
			// Receiving 0x1E is itself the signal the front panel is now showing Global pages (see
			// param_page_change above for the symmetric case).
			uiStore.setGlobalPagesActive(true);
			uiStore.setDisplayedGlobalParamPage(Math.floor(page / 3));
			uiStore.setSelectedGlobalParamBank(page % 3);
			return true;
		}
		if (ev.type === 'global_knob_map_changed') {
			// Global Parameter Pages sibling of knob_map_changed above — same "stateless ping, full
			// reload, likely near-dead in practice" caveat (see g2_events.c's 0x75 case).
			log('←', 'Watch', 'global_knob_map_changed', 'param');
			await slotsStore.loadGlobalKnobs();
			return true;
		}
		if (ev.type === 'patch_param') {
			log('←', 'Watch', `patch_param s=${ev.slot} m=${ev.module} p=${ev.param} v=${ev.value} var=${ev.variation}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			if (ev.module === 1) {
				// Section 1 = morphs: params 0–7 are dials, 8–15 are modes
				const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
				if (vState) {
					if ((ev.param as number) < 8) vState.patch.morphDials[ev.param as number] = ev.value as number;
					else vState.patch.morphModes[(ev.param as number) - 8] = ev.value as number;
					slotsStore._markSlotDirty(slotLabel);
				}
				return true;
			}
			// Hardware sends section-local param indices; ev.module holds the section ID (2–7).
			// Section offsets map to global PATCH_PARAM_KEYS indices.
			const SECTION_OFFSETS: Record<number, number> = { 2: 0, 3: 2, 4: 4, 5: 6, 6: 9, 7: 13 };
			const globalIdx = (SECTION_OFFSETS[ev.module as number] ?? 0) + (ev.param as number);
			const key = PATCH_PARAM_KEYS[globalIdx];
			const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
			if (vState && key) {
				(vState.patch as unknown as Record<string, number>)[key] = ev.value;
				slotsStore._markSlotDirty(slotLabel);
			}
			return true;
		}
		if (ev.type === 'morph_change') {
			log(
				'←',
				'Watch',
				`morph_change s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} morph=${ev.morph} v=${ev.value} neg=${ev.negative} var=${ev.variation}`,
				'param',
			);
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			const location: 0 | 1 = ev.area === 'va' ? 1 : 0;
			const groupIndex = ev.morph as number;
			const moduleIndex = ev.module as number;
			const paramIndex = ev.param as number;
			const variation = ev.variation as number;
			const range = ev.negative ? -(ev.value as number) : (ev.value as number);
			resolveParamEcho(`${slotLabel}:morph:${variation}:${groupIndex}:${location}:${moduleIndex}:${paramIndex}`, range);
			const vState = slotsStore.slots[slotLabel]?.variations?.[variation];
			if (vState) {
				const list = vState.patch.morphAssignments;
				const idx = list.findIndex(
					(a) => a.groupIndex === groupIndex && a.location === location && a.moduleIndex === moduleIndex && a.paramIndex === paramIndex,
				);
				if (range === 0) {
					if (idx !== -1) vState.patch.morphAssignments = [...list.slice(0, idx), ...list.slice(idx + 1)];
				} else if (idx !== -1) {
					vState.patch.morphAssignments = [...list.slice(0, idx), { ...list[idx], range }, ...list.slice(idx + 1)];
				} else {
					vState.patch.morphAssignments = [...list, { groupIndex, location, moduleIndex, paramIndex, range }];
				}
				slotsStore._markSlotDirty(slotLabel);
			}
			return true;
		}
		if (ev.type === 'knob_map_changed') {
			// Front-panel Parameter Page knob assign, decoded from CMBarbMapChangeNotify (0x74) —
			// see cli/src/g2_events.c. NOTE (2026-08-28): a one-off capture showed this instead of
			// an S_ASSIGN_KNOB (0x25) echo, but it wasn't reproducible on a follow-up pass — an
			// unconditional raw-USB debug capture showed nothing sent at all for several repeated
			// front-panel assigns, and Clavia's own official editor doesn't reflect front-panel
			// knob assigns live either. So this handler is effectively unreachable in practice —
			// kept as correct-if-it-ever-fires (full reload, since the notification carries no
			// module/param/slot-index fields), not as a working live-sync feature. Front-panel
			// knob assignment not syncing live is an accepted gap (manual reload picks it up).
			log('←', 'Watch', `knob_map_changed slot=${ev.slot}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			await slotsStore.loadSlot(slotLabel, true);
			slotsStore._markSlotDirty(slotLabel);
			return true;
		}
		if (ev.type === 'patch_name') {
			const sl = ev.slot as SlotLabel;
			if (sl && slotsStore.slots[sl]) {
				slotsStore.slots[sl].name = ev.name;
				slotsStore._markSlotDirty(sl);
			}
			log('←', 'Watch', `patch_name slot=${ev.slot} name=${ev.name}`);
			return true;
		}
		if (ev.type === 'patch_version_change') {
			log('←', 'Watch', `patch_version_change slot=${ev.slot} ver=${ev.version}`);
			const sl = ev.slot as SlotLabel;
			if (sl) pendingSlotReload.add(sl);
			return true;
		}
		if (ev.type === 'patch_update') {
			log('←', 'Watch', `patch_update slot=${ev.slot}`);
			const sl = ev.slot as SlotLabel;
			if (sl) fetchSlotResources(sl);
			return true;
		}
		if (ev.type === 'resources_used' && Array.isArray(ev.data)) {
			const sl = ev.slot as SlotLabel;
			if (sl) {
				slotsStore.updateResources(sl, ev.data);
				if (pendingSlotReload.has(sl)) {
					pendingSlotReload.delete(sl);
					// This reload is triggered by our own structural edit bumping the G2's patch
					// version (add/move/delete module, cable changes, etc.) — preserve undo history
					// and the dirty flag, which the edit that caused this already set correctly.
					slotsStore.loadSlot(sl, true);
				}
			}
			log('←', 'Watch', `resources slot=${ev.slot} loc=${ev.location ?? (ev.data?.[0] === 1 ? 'va' : 'fx')}`);
			return true;
		}
		return false;
	}

	return { hardwareVariationChange, hardwareSlotChange, fetchSlotResources, requestKeyFocus, handleEvent };
}
