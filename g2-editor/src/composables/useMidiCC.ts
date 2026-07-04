import type { ContextMenuItem, MidiCCAssignment } from '@/types';
import { useKeyHoldOverlay } from './useKeyHoldOverlay';

const RESERVED_CC = new Set([0, 1, 7, 11, 17, 18, 32, 64, 70, 96, 97, 120, 121, 122, 123, 124, 125, 126, 127]);

const CC_NAMES: Record<number, string> = {
	2: 'Breath',
	4: 'Foot',
	5: 'Port.Time',
	6: 'Data Entry',
	8: 'Balance',
	10: 'Pan',
	12: 'Effect 1',
	13: 'Effect 2',
	65: 'Portamento',
	66: 'Sostenuto',
	67: 'Soft Pedal',
	68: 'Legato',
	69: 'Hold 2',
	71: 'Timbre',
	72: 'Release',
	73: 'Attack',
	74: 'Brightness',
	84: 'Port.Ctrl',
	91: 'FX1 Depth',
	92: 'FX2 Depth',
	93: 'FX3 Depth',
	94: 'FX4 Depth',
	95: 'FX5 Depth',
};

export function isAllowedCC(n: number): boolean {
	return n >= 2 && n <= 119 && !RESERVED_CC.has(n);
}

export function getAllowedCCs(): number[] {
	const result: number[] = [];
	for (let i = 2; i <= 119; i++) {
		if (!RESERVED_CC.has(i)) result.push(i);
	}
	return result;
}

export const CC_SHORT: Record<number, string> = {
	2: 'Breath',
	4: 'Foot',
	5: 'Port.T',
	6: 'DataEnt',
	8: 'Balance',
	10: 'Pan',
	12: 'FX1',
	13: 'FX2',
	65: 'Portam',
	66: 'Sosnut',
	67: 'Soft',
	68: 'Legato',
	69: 'Hold2',
	71: 'Timbre',
	72: 'Release',
	73: 'Attack',
	74: 'Bright',
	84: 'Port.C',
	91: 'FX1D',
	92: 'FX2D',
	93: 'FX3D',
	94: 'FX4D',
	95: 'FX5D',
};

export function ccLabel(n: number): string {
	const name = CC_NAMES[n];
	return name ? `CC ${n}: ${name}` : `CC ${n}`;
}

// Builds the 3-item "Assign CC (last) / Assign CC… / Deassign CC" context-menu block shared by
// module-param and morph CC assignment.
export function buildCCMenuItems(opts: {
	lastCC: number | null;
	existing: MidiCCAssignment | undefined;
	enabled: boolean;
	onAssign: (cc: number) => void;
	onDeassign: () => void;
}): ContextMenuItem[] {
	const { lastCC, existing, enabled, onAssign, onDeassign } = opts;
	return [
		{
			label: lastCC !== null ? `Assign CC (${lastCC})` : 'Assign CC (none)',
			disabled: lastCC === null || !enabled,
			action: () => lastCC !== null && onAssign(lastCC),
		},
		{
			label: 'Assign CC…',
			children: getAllowedCCs().map((cc) => ({ label: ccLabel(cc), action: () => onAssign(cc) })),
		},
		{
			label: existing ? `Deassign CC (${existing.cc})` : 'Deassign CC',
			disabled: !existing,
			action: onDeassign,
		},
	];
}

export function useMidiCCOverlay() {
	const { isVisible } = useKeyHoldOverlay('F8');
	return { showCCOverlay: isVisible };
}

// Reads the { type: 'cc', cc } payload set by a CC badge drag start. Returns null if the drop
// didn't carry a CC payload (wrong drag source, or malformed data).
export function parseCCDragPayload(event: DragEvent): { cc: number } | null {
	const raw = event.dataTransfer?.getData('text/plain');
	if (!raw) return null;
	try {
		const data = JSON.parse(raw);
		return data.type === 'cc' ? { cc: data.cc } : null;
	} catch {
		return null;
	}
}
