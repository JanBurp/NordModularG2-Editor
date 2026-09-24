// Morph Group assignment colors: red = the currently selected group, blue = a different group.
export const MORPH_COLOR_HEX = {
	red: '#e0303c',
	blue: '#4a63c8',
} as const;

export type MorphColor = keyof typeof MORPH_COLOR_HEX;

export function morphColorHex(color: MorphColor | null | undefined, fallback: string = MORPH_COLOR_HEX.blue): string {
	if (color === 'red') return MORPH_COLOR_HEX.red;
	if (color === 'blue') return MORPH_COLOR_HEX.blue;
	return fallback;
}
