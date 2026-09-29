// Centralized text for the contextual one-line StatusBar hint (see useStatusHint.ts).
// Edit the strings here — nothing else needs to change to update what a hint says.
import { isMac } from '@/utils/platform';

const MOD = isMac ? '⌘' : 'Ctrl'; // Cmd on Mac, Ctrl elsewhere
const CTRL = isMac ? '⌃' : 'Ctrl'; // Mac keeps a separate Control key distinct from Cmd
const ALT = isMac ? '⌥' : 'Alt';

export const STATUS_HINTS = {
	// Canvas — hidden gestures
	jackConnectedDrag: `${MOD}-drag: move · ${MOD}-click: grab to re-route · Click: cycle connections · Backspace: delete`,
	jackConnectedClick: `${MOD}-drag: move · ${MOD}-click: grab to re-route · Click: connect/cancel · Backspace: delete`,
	jackArm: 'Click: start a cable · Click again: cancel',
	ghostCable: 'Enter: confirm suggested cable · Space: next suggestion · Escape: dismiss',
	moduleTitle: 'Double-click: rename · Right-click: more options',
	moduleReplace: 'Click: replace module',
	paramMorph: `${CTRL}-click: assign to Morph Group · ${CTRL}-drag: set range · ${ALT}-drag: assign to Parameter Page`,
	ccRow: 'Click: select · Drag: reassign CC',
	paramPageKnob: `${CTRL}-drag: set morph range · ${ALT}-drag: assign/swap · Right-click: more options`,
	morphKnob: 'Right-click: rename, clear, copy · Drop CC here: assign',

	// StatusBar — area switch
	areaVoice: 'V: show Voice (again: Split)',
	areaSplit: 'Space: show/hide cables · Ctrl-Space: shake cables',
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
	slotIndicators: `Shift-click: toggle active · ${CTRL}-click: toggle focus`,
	connectionToggle: 'Click: connect / disconnect G2',
	renamePatch: 'Click: rename patch',
	renamePerf: 'Click: rename performance',
	setBpm: 'Click: set tempo',
	cableShake: 'Redraw overlapping cables',
} as const;

export type StatusHintKey = keyof typeof STATUS_HINTS;
