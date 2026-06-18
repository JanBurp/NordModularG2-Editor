export type SlotLabel = 'A' | 'B' | 'C' | 'D';

export type MenuAction =
	| 'new-patch'
	| 'new-performance'
	| 'open'
	| 'open-performance'
	| 'save'
	| 'save-as'
	| 'save-all'
	| 'delete'
	| 'select-all'
	| 'toggle-modules'
	| 'toggle-browser'
	| 'toggle-settings'
	| 'toggle-svg-viewer'
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
	| 'show-module-help';

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

export interface DeviceState {
	connected: boolean;
	device: Device | null;
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
	canLabel?: boolean;
	trigger?: boolean;
}

export type ParamMap = Record<string, ParamDefinition>;

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
export type { Patch, Area, Cable, PatchDescription, PatchParamVariation, VariationState } from './patch';
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
	disabled?: boolean;
	action?: () => void;
	children?: ContextMenuItem[];
	swatches?: ContextMenuSwatch[];
	bgColor?: string;
}
