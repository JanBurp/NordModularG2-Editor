import { MORPH_COLOR_HEX } from '../constants/colors';

export type MorphColor = keyof typeof MORPH_COLOR_HEX;

export function morphColorHex(color: MorphColor | null | undefined, fallback: string = MORPH_COLOR_HEX.blue): string {
	if (color === 'red') return MORPH_COLOR_HEX.red;
	if (color === 'blue') return MORPH_COLOR_HEX.blue;
	return fallback;
}
