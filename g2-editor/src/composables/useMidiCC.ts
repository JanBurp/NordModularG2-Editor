import type { MidiCCAssignment } from '@/types';
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

export function getFreeCCs(controllers: MidiCCAssignment[]): number[] {
	const used = new Set(controllers.map((c) => c.cc));
	return getAllowedCCs().filter((cc) => !used.has(cc));
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

export function useMidiCCOverlay() {
	const { isVisible } = useKeyHoldOverlay('F8');
	return { showCCOverlay: isVisible };
}
