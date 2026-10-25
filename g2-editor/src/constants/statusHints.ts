// Centralized text for the contextual one-line StatusBar hint (see useStatusHint.ts).
// Edit the strings here — nothing else needs to change to update what a hint says.
import { isMac } from '@/utils/platform';

export const MOD = isMac ? '⌘' : 'Ctrl'; // Cmd on Mac, Ctrl elsewhere
export const ALT = isMac ? '⌥' : 'Alt';
export const SHIFT = isMac ? '⇧' : 'Shift';

export const STATUS_HINTS = {
	// Canvas — hidden gestures
	// Order: plain adjust · fine/faster · Morph · Parameter Page · other · Right-click
	jackConnectedDrag: `Click: cycle connections · ${MOD}-drag: move · ${MOD}-click: grab to re-route · Backspace: delete`,
	jackConnectedClick: `Click: connect/cancel · ${MOD}-drag: move · ${MOD}-click: grab to re-route · Backspace: delete`,
	jackArm: 'Click: start a cable · Click again: cancel',
	ghostCable: 'Enter: confirm suggested cable · Space: next suggestion · Escape: dismiss',
	moduleTitle: 'Drag: move · Shift-click: add to selection · Double-click: rename · Right-click: more options',
	moduleReplace: 'Click: replace module',
	paramKnob: `Drag/Wheel: adjust · Shift-drag: fine · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign to Parameter Page · Double-click/Enter: default · Shift-click/=: set value · Right-click: more options`,
	paramSlider: `Drag/Wheel: adjust · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign to Parameter Page · Double-click/Enter: default · Shift-click/=: set value · Right-click: more options`,
	paramSpinner: `Click/Hold/Wheel: step · ${MOD}-click: assign to Morph Group · ${ALT}-drag: assign to Parameter Page · =: set value · Enter: default · Right-click: more options`,
	paramSwitch: `Click: change · ${MOD}-click: assign to Morph Group · ${ALT}-drag: assign to Parameter Page · Right-click: more options`,
	ccRow: `Click: select · Shift-click: select range · ${MOD}-click: add/remove from selection · Drag: reassign CC`,
	paramPageKnob: `Drag/Wheel: adjust · Shift-drag: fine · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign/swap · Double-click: default · Right-click: more options`,
	paramPageDisplay: 'Drag: assign to a canvas parameter / move to another box · Right-click: more options',
	// A Morph Group's dial on a Parameter Page knob: no morph-assign (a dial can't be morphed), no button.
	paramPageMorphKnob: `Drag/Wheel: adjust · Shift-drag: fine · ${ALT}-drag: assign/swap · Double-click: default · Right-click: deassign`,
	morphKnob: `Click: select group · Drag/Wheel: adjust · Shift-drag: fine · Double-click: default · ${ALT}-drag: assign to Parameter Page · Drop CC here: assign · Right-click: rename, clear, copy, assign`,

	// Patch Mutator — sound boxes
	mutaBox: `Click: audition · Double-click: mutate from this sound · Drag: copy to another box · Shift-drop: interpolate · ${ALT}-drop: cross`,
	mutaStorage: `Click: audition · Double-click: mutate from this sound · Drag: move/copy · Shift-drop: interpolate · ${ALT}-drop: cross · Right-click: delete`,
	morphSource: 'Click: cycle morph source',
	paramPageCell: `${ALT}-drag: move/swap, or drop on a canvas parameter or Morph knob to assign · Right-click: deassign, morph`,
	paramPageButton: 'Click: change button value',
	globalPages: 'Click: switch between Patch and Global parameter pages',
	paramBank: 'Click: select parameter bank',
	paramPage: 'Click: select parameter page',
	patchLevel: 'Drag/Wheel: adjust · Shift-drag: fine · Double-click: default',
	patchActive: 'Click: mute / unmute patch',

	// StatusBar — area switch
	areaVoice: 'V: show Voice (again: Split)',
	areaSplit: 'Space/H: show/hide cables · S/Shift-Space: shake cables',
	areaFx: 'F: show FX (again: Split)',

	// StatusBar — side panel tabs
	paneBrowser: `${MOD}B: browse patches & files`,
	paneModules: `${MOD}L: drag modules onto the canvas`,
	paneMidicc: `${MOD}I: MIDI CC assignments`,
	paneOverview: `⇧${MOD}F: all Parameter Pages at once`,
	paneMutator: `${MOD}2: Patch Mutator — breed new sounds from this patch`,
	paneText: `${MOD}J: patch notes`,
	paneSettings: `${MOD}, : editor, device, and patch settings`,

	// Side panel — browser, modules, MIDI CC
	browserView: 'Click: switch between Disk, Patches and Performances',
	browserUp: 'Click: up one folder',
	browserChooseFolder: 'Click: choose folder',
	browserFolder: 'Click/Enter: open folder · ←: parent folder · ↑↓: navigate',
	browserFile: 'Double-click/Enter: load · ←: parent folder · ↑↓: navigate',
	browserPatch: 'Double-click/Enter: load · ↑↓: navigate · Right-click: store here, delete',
	browserBank: 'Click: expand/collapse · Right-click: store, bank upload/download, clear, sort, organizer',

	// Bank Organizer
	organizerCell: `Drag: · Drop on cell: swap · ${ALT}-drag: copy · Drop on Temporary Storage: copy · Drop on a Slot: load · Click: select · Delete: delete · Right-click: more options`,
	organizerStorage: `Drag onto a location: copy to the G2 · Click: select · Delete: delete · Right-click: more options`,
	organizerSlot: 'Drop: load it into this slot · Drag onto a location: store this slot there · Right-click: store in a bank',
	organizerTrash: 'Drop to delete · Delete: delete the selection',
	organizerCategory: 'Click: give the selected patches this category (select patches first)',
	organizerSort: 'Click: sort this column by location, name or category',
	organizerSortLink: 'Click: both columns use the same sort (on/off)',
	organizerBankTransfer: 'Upload: save this bank from the G2 to disk · Download: overwrite this bank on the G2 from disk',
	organizerClose: `${MOD}3/Escape: close the Bank Organizer`,
	expandCollapseAll: 'Click: expand/collapse all',
	expandCollapse: 'Click: expand/collapse',
	moduleItem: 'Drag: add to canvas · Click: show/hide help',
	ccAutoAssign: 'Click: assign free CCs to the parameters of the selected modules',

	// Toolbars
	variationCopy: 'Drag or right-click: copy to another variation',
	variationInit: 'Click: reset current variation to INIT',
	slotIndicators: `Shift-click: toggle active · ${MOD}-click: toggle focus`,
	connectionToggle: 'Click: connect / disconnect G2',
	renamePatch: 'Click: rename patch',
	renamePerf: 'Click: rename performance',
	setBpm: 'Click: set tempo',
	cableShowHideAll: 'Space/H: show/hide all cables',
	cableShake: 'S/Shift-Space: redraw overlapping cables',
	cableColorToggle: 'Click: show/hide cables of this color',
	colorApply: 'Click: apply color to selected modules',
	colorChoose: 'Click: choose color',
	clockRun: 'Click: start/stop master clock',
	perfMode: 'Click: switch Patch/Performance mode · Shift-click: create performance/get patches from performance',
	deviceSwitch: 'Click: switch to this device',
	undo: `Click/${MOD}Z: undo`,
	redo: `Click/Shift-${MOD}Z: redo`,
	newPatch: 'Click: new empty patch',
	initPatch: 'Click: load init patch',
	modulePickerCategory: 'Click: show category · Tab/Shift-Tab: next/previous category',
	modulePickerModule: 'Drag: add to canvas · ,/.: select module · Enter: add selected module',
	keyboardScroll: 'Click: scroll keyboard by an octave (<< >>) or a semitone (< >)',
	keyboardDrone: 'Click: hold played note until clicked again',
	keyboardRepeat: 'Click: repeatedly re-strike played note',
	keyboardKeys: 'Click: play note · Drag: glide across keys',
} as const;

export type StatusHintKey = keyof typeof STATUS_HINTS;
