// Centralized text for the contextual one-line StatusBar hint (see useStatusHint.ts).
// Edit the strings here — nothing else needs to change to update what a hint says.
import { isMac } from '@/utils/platform';

const MOD = isMac ? '⌘' : 'Ctrl'; // Cmd on Mac, Ctrl elsewhere
const CTRL = isMac ? '⌃' : 'Ctrl'; // Mac keeps a separate Control key distinct from Cmd
const ALT = isMac ? '⌥' : 'Alt';

export const STATUS_HINTS = {
	// Canvas — hidden gestures
	jackConnected: `${MOD}-drag: move this cable · Click: cycle through connections`,
	moduleTitle: 'Double-click: rename · Right-click: more options',
	moduleReplace: 'Click: replace with another module in this group',
	paramMorph: `${CTRL}-click: assign to Morph Group · ${CTRL}-drag: set range · ${ALT}-drag: assign to Parameter Page`,
	ccRow: 'Drag to move this CC to another number',

	// StatusBar — area switch
	areaVoice: 'V: show Voice (again: Split)',
	areaSplit: 'Space: show/hide cables · Ctrl-Space: shake cables',
	areaFx: 'F: show FX (again: Split)',

	// StatusBar — side panel tabs
	paneBrowser: `${MOD}B: browse patches, performances, and disk files`,
	paneModules: `${MOD}M: drag modules onto the canvas`,
	paneMidicc: `${MOD}I: view and edit MIDI CC assignments`,
	paneText: `${MOD}J: patch notes, saved with the patch`,
	paneSettings: `${MOD}, : editor, device, and patch settings`,

	// Toolbars
	variationCopy: 'Drag or right-click: copy to another variation',
	variationInit: 'Click: reset current variation to INIT',
	slotIndicators: 'Top dot: has keyboard focus · Bottom dot: active on hardware',
	connectionToggle: 'Click: connect / disconnect G2',
	renamePatch: 'Click: rename patch',
	renamePerf: 'Click: rename performance',
	setBpm: 'Click: set tempo',
	cableShake: 'Re-render cable curves (new shapes for overlapping cables)',
} as const;

export type StatusHintKey = keyof typeof STATUS_HINTS;
