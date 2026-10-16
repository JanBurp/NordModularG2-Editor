// Centralized text for the contextual one-line StatusBar hint (see useStatusHint.ts).
// Edit the strings here — nothing else needs to change to update what a hint says.
import { isMac } from '@/utils/platform';

const MOD = isMac ? '⌘' : 'Ctrl'; // Cmd on Mac, Ctrl elsewhere
const CTRL = isMac ? '⌃' : 'Ctrl'; // Mac keeps a separate Control key distinct from Cmd
const ALT = isMac ? '⌥' : 'Alt';

export const STATUS_HINTS = {
	// Canvas — hidden gestures
	// Order: plain adjust · fine/faster · Morph · Parameter Page · other · Right-click
	jackConnectedDrag: `Click: cycle connections · ${MOD}-drag: move · ${MOD}-click: grab to re-route · Backspace: delete`,
	jackConnectedClick: `Click: connect/cancel · ${MOD}-drag: move · ${MOD}-click: grab to re-route · Backspace: delete`,
	jackArm: 'Click: start a cable · Click again: cancel',
	ghostCable: 'Enter: confirm suggested cable · Space: next suggestion · Escape: dismiss',
	moduleTitle: 'Drag: move · Shift-click: add to selection · Double-click: rename · Right-click: more options',
	moduleReplace: 'Click: replace module',
	paramKnob: `Drag/Wheel: adjust · Shift-drag: fine · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign to Parameter Page · Double-click: default · Right-click: more options`,
	paramSlider: `Drag/Wheel: adjust · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign to Parameter Page · Double-click: default · Right-click: more options`,
	paramSpinner: `Click/Hold/Wheel: step · ${MOD}-click: assign to Morph Group · ${ALT}-drag: assign to Parameter Page · Right-click: more options`,
	paramSwitch: `Click: change · ${MOD}-click: assign to Morph Group · ${ALT}-drag: assign to Parameter Page · Right-click: more options`,
	ccRow: 'Click: select · Drag: reassign CC',
	paramPageKnob: `Drag/Wheel: adjust · Shift-drag: fine · ${MOD}-click: assign to Morph Group · ${MOD}-drag: set morph range · ${ALT}-drag: assign/swap · Double-click: default · Right-click: more options`,
	morphKnob: 'Click: select group · Drag/Wheel: adjust · Shift-drag: fine · Double-click: default · Drop CC here: assign · Right-click: rename, clear, copy',

	// StatusBar — area switch
	areaVoice: 'V: show Voice (again: Split)',
	areaSplit: `Space: show/hide cables · ${CTRL}-Space: shake cables`,
	areaFx: 'F: show FX (again: Split)',

	// StatusBar — side panel tabs
	paneBrowser: `${MOD}B: browse patches & files`,
	paneModules: `${MOD}L: drag modules onto the canvas`,
	paneMidicc: `${MOD}I: MIDI CC assignments`,
	paneText: `${MOD}J: patch notes`,
	paneSettings: `${MOD}, : editor, device, and patch settings`,

	// Toolbars
	variationCopy: 'Drag or right-click: copy to another variation',
	variationInit: 'Click: reset current variation to INIT',
	slotIndicators: `Shift-click: toggle active · ${MOD}-click: toggle focus`,
	connectionToggle: 'Click: connect / disconnect G2',
	renamePatch: 'Click: rename patch',
	renamePerf: 'Click: rename performance',
	setBpm: 'Click: set tempo',
	cableShake: 'Redraw overlapping cables',
} as const;

export type StatusHintKey = keyof typeof STATUS_HINTS;
