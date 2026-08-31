import type { StatusHintKey } from '@/constants/statusHints';

export interface Option {
	label: string;
	value: string | number;
	disabled?: boolean;
	draggable?: boolean;
	/** StatusBar hint shown while this option is hovered (see useStatusHint.ts). */
	hint?: StatusHintKey;
}
