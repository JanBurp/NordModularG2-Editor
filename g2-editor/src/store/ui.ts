import type { Cable } from '@/renderer/cableRenderer';
import type { ClipboardEntry } from '@/types/patch';
import { SLOT_LABELS } from '@/constants';
import type { JackDragInfo, SlotLabel } from '@/types';
import type { JackEnd } from './slotHelpers';
import type { GhostCable, GhostCandidate } from '@/composables/useGhostCable';
import { clamp } from '@/utils/math';
import { defineStore } from 'pinia';
import { useDeviceStore } from './device';
import { useSettingsStore } from './settings';
import { useSlotsStore } from './slots';

// FBarPosition: pixel height of voice area in original G2 editor (0–16383, 14-bit)
// Confirmed from test patches: FX=0, split-below-Out=239, Voice=551; G2Demo default=600
const FBAR_VOICE = 600; // sentinel written for Voice mode
const FBAR_VOICE_THRESHOLD = 540; // ≥540 treated as Voice (covers original editor's 551 and our 600)

function fbarToArea(h: number): 0 | 1 | 2 {
	if (h <= 0) return 0;
	if (h >= FBAR_VOICE_THRESHOLD) return 1;
	return 2;
}
function fbarToDivider(h: number): number {
	return Math.round((Math.max(1, Math.min(FBAR_VOICE - 1, h)) / FBAR_VOICE) * 100 * 10) / 10;
}

export const useUiStore = defineStore('ui', {
	state: () => ({
		slotInFocus: 'A' as SlotLabel,
		variation: 0 as number,
		moduleColor: 0 as number,
		selectedCables: [] as Cable[],
		selectedModules: [] as number[],
		selectedModulesArea: null as 'va' | 'fx' | null,
		selectedParam: null as { moduleId: number; paramIndex: number } | null,
		selectedMorphGroup: 0 as number, // 0-7, which Morph Group toolbar knob is currently selected
		selectedParamBank: 0 as number, // 0-2, ambient Bank for right-click "Assign to Page" + which bank's row the toolbar shows
		displayedParamPage: 0 as number, // 0-4 (A-E), which Parameter Page the toolbar currently displays
		globalPagesActive: false as boolean, // ParameterPages.vue toggle: off = Patch pages, on = Global (Performance) pages
		selectedGlobalParamBank: 0 as number, // 0-2, independent of selectedParamBank so each view keeps its own position
		displayedGlobalParamPage: 0 as number, // 0-4 (A-E), independent of displayedParamPage
		showSvgViewer: false as boolean,
		showKeyCommandsPage: false as boolean,
		showQuickAdd: false as boolean,
		cableShakeCount: 0 as number,
		draggedModuleId: null as number | null,
		helpModuleTypeId: null as number | null,
		helpAllModules: false as boolean,
		clipboard: null as ClipboardEntry | null,
		// Whether a paste-able entry exists, either locally or (last refreshed) on the OS
		// clipboard — a Pinia field so every consumer (menu enablement, context menus) shares
		// one source of truth instead of each usePatchClipboard() call owning its own copy.
		hasClipboard: false as boolean,
		lastMousePos: null as { col: number; row: number; area: 'va' | 'fx' } | null,
		// Live morph-range Ctrl/Cmd-drag hint, read by MorphDragHintOverlay (canvas-level, rendered
		// after every module) so the badge always paints above other modules instead of being hidden
		// behind whichever one happens to sit below it in the DOM.
		morphDragHint: null as { moduleIndex: number; paramIndex: number; text: string; area: 'va' | 'fx' } | null,
		// Contextual one-line gesture hint shown in StatusBar while hovering a jack/title/param/CC
		// row that has a hidden modifier-key gesture; null when nothing relevant is hovered.
		statusHint: null as string | null,
		// Currently hovered jack (mirrors PatchCanvas.vue's own local hoveredJack, tagged with its
		// area) so the Delete menu action can act on it regardless of which canvas is hovered.
		hoveredJack: null as (JackEnd & { area: 'va' | 'fx' }) | null,
		// Click-connect mode: source jack armed by the first click (armOrConnect in
		// useJackPatching.ts), tagged with its area so each area's useJackDragInteraction.ts
		// instance can tell an armed jack that isn't its own apart from one that is.
		armedJack: null as (JackDragInfo & { area?: 0 | 1 }) | null,
		// Ghost-cable preview — drag-mode live preview, click-connect live preview, and auto-suggest
		// alike — shared so whichever PatchCanvas instance owns the relevant area can render it.
		ghostCable: null as GhostCable | null,
		// Auto-suggest only: the ranked jack-pair candidates for the current ghostCable and which one
		// is currently shown, so SPACE (cycleGhostCable in useGhostCable.ts) can step through them.
		ghostCandidates: [] as GhostCandidate[],
		ghostCandidateIndex: 0,
		// Click-connect mode's currently snap-highlighted jack, shared so App.vue's Enter-key handler
		// can commit whichever canvas's preview is live without a direct reference to that instance.
		clickModeSnapJack: null as (JackDragInfo & { x: number; y: number }) | null,
	}),

	getters: {
		selectedSlotIndex: (state) => SLOT_LABELS.indexOf(state.slotInFocus),

		// Current slot's area mode (0=FX, 1=Voice, 2=Split), derived from patch.description.height
		area: (state): 0 | 1 | 2 => {
			const patch = useSlotsStore().slots[state.slotInFocus].patch;
			return fbarToArea(patch?.description?.height ?? 4000);
		},

		// Active single area for patch/USB operations: never returns 2.
		activeArea: (state): 0 | 1 => {
			const patch = useSlotsStore().slots[state.slotInFocus].patch;
			const area = fbarToArea(patch?.description?.height ?? 4000);
			return area === 2 ? 1 : (area as 0 | 1);
		},

		dividerPos: (state): number => {
			const patch = useSlotsStore().slots[state.slotInFocus].patch;
			return fbarToDivider(patch?.description?.height ?? 2000);
		},
	},

	actions: {
		setSlotInFocus(slot: SlotLabel) {
			this.slotInFocus = slot;
			this.clearSelection();
			useDeviceStore().setPerformanceFocus(slot);
		},

		setModuleColor(index: number) {
			this.moduleColor = index;
		},

		selectModules(indices: number[], area: 'va' | 'fx') {
			this.selectedModules = indices;
			this.selectedModulesArea = area;
		},

		toggleModuleSelection(index: number, area: 'va' | 'fx') {
			const i = this.selectedModules.indexOf(index);
			if (i >= 0) this.selectedModules.splice(i, 1);
			else this.selectedModules.push(index);
			this.selectedModulesArea = area;
		},

		clearSelection() {
			this.selectedModules = [];
			this.selectedModulesArea = null;
			this.selectedCables = [];
			this.selectedParam = null;
		},

		setSelectedParam(moduleId: number, paramIndex: number) {
			this.selectedParam = { moduleId, paramIndex };
		},

		clearSelectedParam() {
			this.selectedParam = null;
		},

		setSelectedMorphGroup(i: number) {
			this.selectedMorphGroup = clamp(i, 0, 7);
		},

		setSelectedParamBank(i: number) {
			this.selectedParamBank = clamp(i, 0, 2);
		},

		setDisplayedParamPage(i: number) {
			this.displayedParamPage = clamp(i, 0, 4);
		},

		// Explicit set (not a blind toggle) so both the toolbar click and an incoming hardware echo
		// (param_page_change/global_page_change in useSlotEvents.ts — receiving one IS the signal
		// for which mode the front panel is now showing, since there's no separate "enter Global
		// mode" opcode) can drive it without racing each other.
		setGlobalPagesActive(active: boolean) {
			this.globalPagesActive = active;
		},

		setSelectedGlobalParamBank(i: number) {
			this.selectedGlobalParamBank = clamp(i, 0, 2);
		},

		setDisplayedGlobalParamPage(i: number) {
			this.displayedGlobalParamPage = clamp(i, 0, 4);
		},

		toggleSvgViewer() {
			this.showSvgViewer = !this.showSvgViewer;
		},

		showModuleHelp(typeId: number) {
			this.helpAllModules = false;
			if (this.helpModuleTypeId === typeId) {
				this.helpModuleTypeId = null;
				return;
			}
			this.helpModuleTypeId = typeId;
			const settings = useSettingsStore();
			if (!settings.showRightPane || settings.rightPaneTab !== 'modules') {
				settings.rightPaneTab = 'modules';
				settings.showRightPane = true;
			}
		},

		toggleAllModuleHelp() {
			this.helpModuleTypeId = null;
			this.helpAllModules = !this.helpAllModules;
			const settings = useSettingsStore();
			if (this.helpAllModules && (!settings.showRightPane || settings.rightPaneTab !== 'modules')) {
				settings.rightPaneTab = 'modules';
				settings.showRightPane = true;
			}
		},

		shakeCables() {
			this.cableShakeCount++;
		},

		setAreaFbar(fbar: number) {
			useSlotsStore().setPatchDescriptionField('height', Math.max(0, Math.min(16383, fbar)));
			this.clearSelection();
		},

		setAreaMode(mode: 0 | 1 | 2) {
			const patch = useSlotsStore().slots[this.slotInFocus].patch;
			if (this.area === 2 && mode !== 2 && patch?.description) patch.splitHeight = patch.description.height;
			if (mode === 0) this.setAreaFbar(0);
			else if (mode === 1) this.setAreaFbar(FBAR_VOICE);
			else if (this.area !== 2) this.setAreaFbar(patch?.splitHeight ?? Math.round(FBAR_VOICE / 2));
			useSlotsStore().setPatchDescription();
		},

		toggleSplit() {
			const patch = useSlotsStore().slots[this.slotInFocus].patch;
			if (this.area === 2) {
				if (patch?.description) patch.splitHeight = patch.description.height;
				this.setAreaFbar(this.dividerPos >= 50 ? FBAR_VOICE : 0);
			} else {
				this.setAreaFbar(patch?.splitHeight ?? Math.round(FBAR_VOICE / 2));
			}
			useSlotsStore().setPatchDescription();
		},

		setDividerPos(pos: number) {
			const fbar = Math.max(1, Math.min(FBAR_VOICE - 1, Math.round((pos / 100) * FBAR_VOICE)));
			this.setAreaFbar(fbar);
		},
	},
});
