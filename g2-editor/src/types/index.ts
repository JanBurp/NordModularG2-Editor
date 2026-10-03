export type SlotLabel = 'A' | 'B' | 'C' | 'D';

export type MenuAction =
	| 'new-patch'
	| 'new-performance'
	| 'new-to-A'
	| 'new-to-B'
	| 'new-to-C'
	| 'new-to-D'
	| 'open'
	| 'open-performance'
	| 'open-to-A'
	| 'open-to-B'
	| 'open-to-C'
	| 'open-to-D'
	| 'save'
	| 'save-as'
	| 'save-all'
	| 'save-from-A'
	| 'save-from-B'
	| 'save-from-C'
	| 'save-from-D'
	| 'save-init-1'
	| 'save-init-2'
	| 'delete'
	| 'delete-unused-modules'
	| 'delete-unused-cables'
	| 'select-all'
	| 'paste-params'
	| 'toggle-modules'
	| 'toggle-browser'
	| 'toggle-settings'
	| 'toggle-svg-viewer'
	| 'toggle-keyboard'
	| 'area-voice'
	| 'area-fx'
	| 'area-split'
	| 'slot-A'
	| 'slot-B'
	| 'slot-C'
	| 'slot-D'
	| 'variation-1'
	| 'variation-2'
	| 'variation-3'
	| 'variation-4'
	| 'variation-5'
	| 'variation-6'
	| 'variation-7'
	| 'variation-8'
	| 'show-module-help'
	| 'undo'
	| 'redo'
	| 'zoom-in'
	| 'zoom-out'
	| 'zoom-reset'
	| 'open-patch-settings'
	| 'open-performance-settings'
	| 'open-synth-settings'
	| 'download-to-slot'
	| 'download-performance'
	| 'upload-active-slot'
	| 'store-in-synth'
	| 'bank-upload'
	| 'bank-download'
	| 'send-controller-snapshot'
	| 'dump-one';

export interface MenuState {
	connected: boolean;
	canUndo: boolean;
	canRedo: boolean;
	hasSelection: boolean;
	hasClipboard: boolean;
	hasCurrentPatch: boolean;
	hasPerformanceContext: boolean;
	isPerformanceMode: boolean;
}

export interface SlotInfo {
	slot: SlotLabel;
	bank: number;
	patch: number;
	name: string;
	active: boolean;
	key: boolean;
	hold: boolean;
	range: { lower: number; upper: number };
}

export interface Slots {
	A: SlotInfo | null;
	B: SlotInfo | null;
	C: SlotInfo | null;
	D: SlotInfo | null;
}

export interface PerformanceData {
	name: string;
	focus: string;
	rangeEnable: boolean;
	bpm: number;
	clockRunning: boolean;
	knobSourceGlobal?: boolean; // Parameter Pages source: false = Patch, true = Global (SHIFT+GLOBAL)
}

export interface Device {
	synthName: string;
	mode: string;
	perfBank: number;
	perfLoc: number;
	memProtect: boolean;
	globalOctaveShiftActive: boolean;
	globalOctaveShift: number;
	performance: PerformanceData | null;
	slots: SlotInfo[];
	midi: {
		slots: { A: number; B: number; C: number; D: number; global: number };
		sysex: number;
		local: boolean;
		prgch: number;
		ctrlsRecv: boolean;
		ctrlsSend: boolean;
		clkse: boolean;
		clkre: boolean;
	};
	tuning: { semi: number; cent: number };
	pedal: { polarity: boolean; gain: number };
}

export interface ParamDefinition {
	names?: string[];
	width?: number;
	height?: number;
	low: number;
	high: number;
	def: number;
	defin?: string[];
	comments?: string;
	mode?: string;
	bmp?: string;
	f?: string;
	w?: number;
	maskh?: number;
	rows?: number;
	img?: string;
	h?: number;
	trigger?: boolean;
	graph?: boolean | string;
}

export interface ModuleJack {
	name: string;
	colour: string;
	x: number;
	y: number;
}

export type {
	ModuleInstance,
	ModuleParam,
	ModuleMode,
	ModuleInput,
	ModuleOutput,
	ModulePage,
	ModuleDefinition,
	JackDragInfo,
	VisualElement,
	ParamLabel,
} from './module';
export type {
	Patch,
	Area,
	Cable,
	PatchDescription,
	PatchParamVariation,
	VariationState,
	MidiCCAssignment,
	MorphAssignment,
	ParamPageAssignment,
	GlobalParamPageAssignment,
} from './patch';
export { NUM_VARIATIONS } from './patch';
export type { CliService } from './cli';

export interface ContextMenuSwatch {
	color: string;
	action: () => void;
	fullWidth?: boolean;
}

export interface ContextMenuItem {
	type?: 'item' | 'separator' | 'swatches';
	label?: string;
	icon?: string;
	disabled?: boolean;
	action?: () => void;
	children?: ContextMenuItem[];
	swatches?: ContextMenuSwatch[];
	bgColor?: string;
}
