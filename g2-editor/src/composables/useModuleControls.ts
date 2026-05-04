import { getParam, adsrT, adsrL, lfoP, rateBPM, rateLo, OscFreq, filterFreq, filterFreq1, filterFreq2 } from '../renderer/parammap';
import type { ModuleDefinition } from '../types';

export const paramFormattingFunctions: Record<string, (i: number) => string> = {
	adsrT,
	adsrL: adsrL as unknown as (i: number) => string,
	lfoP: lfoP as unknown as (i: number) => string,
	rateBPM,
	filterFreq,
	filterFreq1,
	filterFreq2,
};

export const paramFormattingFunctionsWithArgs: Record<string, (i: number, con: unknown, tw: unknown) => string | undefined> = {
	OscFreq,
	rateLo,
};

export function isKnob(n: string): boolean {
	return ['KnobBig', 'KnobMedium', 'KnobSmall', 'KnobReset'].includes(n);
}

export function isSlider(n: string): boolean {
	return ['KnobSlider', 'KnobSeqSlider'].includes(n);
}

export function isSwitch(n: string): boolean {
	return n?.startsWith('SwM') || n === 'levelshift';
}

export function isSpinner(n: string): boolean {
	return n === 'KnobSpin';
}

export function isSpinnerH(n: string): boolean {
	return n === 'KnobSpinH';
}

export function formatValue(value: number, paramType: string): string {
	const p = getParam(paramType);
	if (!p) return String(value);

	if (p.f && paramFormattingFunctions[p.f]) {
		try {
			return paramFormattingFunctions[p.f](value) || String(value);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

export function formatCombinedValue(refIndices: number[], funcName: string | undefined, params: ModuleDefinition['params'], values: number[]): string {
	if (!params) return '';

	const firstParam = params[refIndices[0]];
	if (!firstParam) return '';

	const p = getParam(firstParam.type);
	if (!p) return '';

	const formatFunc = funcName || p.f;

	if (formatFunc && paramFormattingFunctionsWithArgs[formatFunc]) {
		try {
			const controls: { l: number; p: unknown }[] = [];

			params.forEach((param, idx) => {
				controls[idx] = {
					l: values[idx] ?? 64,
					p: getParam(param.type),
				};
			});

			const tw = {
				ca: refIndices,
			};

			const result = paramFormattingFunctionsWithArgs[formatFunc](0, controls, tw);

			if (result && result !== 'undefined') {
				return result;
			}

			return refIndices.map((idx) => values[idx] ?? 64).join(' ');
		} catch (e) {
			console.error('Format error:', formatFunc, e);
			return refIndices.map((idx) => values[idx] ?? 64).join(' ');
		}
	}

	return refIndices.map((idx) => values[idx] ?? 64).join(' ');
}
