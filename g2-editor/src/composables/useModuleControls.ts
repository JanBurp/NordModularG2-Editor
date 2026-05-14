import { MidiNote, OscFreq, adsrL, adsrT, filterFreq, filterFreq1, filterFreq2, getParam, lfoP, rateBPM, rateLo } from '../renderer/parammap';

import type { ModuleDefinition } from '../types';

export const paramFormattingFunctions: Record<string, (i: number) => string> = {
	adsrT,
	adsrL: adsrL as unknown as (i: number) => string,
	lfoP: lfoP as unknown as (i: number) => string,
	rateBPM,
	filterFreq,
	filterFreq1,
	filterFreq2,
	MidiNote
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

export const definReplacements: Record<string, string> = {
	'{+-}': '±',
	'{00}': '∞',
};

export function applyDefinReplacements(label: string, extraReplacements?: Record<string, string>): string {
	const replacements = extraReplacements
		? { ...definReplacements, ...extraReplacements }
		: definReplacements;

	let result = label;
	for (const [from, to] of Object.entries(replacements)) {
		result = result.split(from).join(to);
	}
	return result;
}

export function parseDefin(defin: string[]): Array<{ numVal: number; label: string }> {
	if (!defin || defin.length === 0) return [];
	return defin[0].split(',')
		.map(s => {
			const [v, label] = s.split('~').map(p => p.trim());
			return { numVal: Number(v), label };
		})
		.sort((a, b) => a.numVal - b.numVal);
}

export function calcDefinOptions(value: number, options: Array<{ numVal: number; label: string }>, extraReplacements?: Record<string, string>, isClkMode?: boolean): string {
	const exact = options.find(o => o.numVal === value);
	if (exact) return applyDefinReplacements(exact.label, extraReplacements);

	if (isClkMode) {
		let nearest = options[0];
		let minDist = Math.abs(value - options[0].numVal);
		for (const opt of options) {
			const dist = Math.abs(value - opt.numVal);
			if (dist <= minDist) {
				minDist = dist;
				nearest = opt;
			}
		}
		return applyDefinReplacements(nearest.label, extraReplacements);
	}

	for (let i = 0; i < options.length - 1; i++) {
		const curr = options[i];
		const next = options[i + 1];
		if (value > curr.numVal && value < next.numVal) {
			const currNum = parseFloat(curr.label.replace(/^[^\d]+/, ''));
			const nextNum = parseFloat(next.label.replace(/^[^\d]+/, ''));
			if (!isNaN(currNum) && !isNaN(nextNum)) {
				const t = (value - curr.numVal) / (next.numVal - curr.numVal);
				const resultNum = currNum + t * (nextNum - currNum);
				const nextPostfix = next.label.replace(/^(\D*\d+\.?\d*)/, '').replace(/^(\.\d+)/, '');
				const nextHasDecimalAndPostfix = /\.\d/.test(next.label) && nextPostfix.length > 0;
				const hasDecimal = resultNum % 1 !== 0 || nextHasDecimalAndPostfix;
				const formatted = hasDecimal ? resultNum.toFixed(1) : String(Math.round(resultNum));
				const currNumericMatch = curr.label.match(/^(\D*)(\d+\.?\d*)(.*)$/);
				const currHasNumeric = currNumericMatch && currNumericMatch[2].length > 0 && /^-?\d/.test(curr.label);
				const prefix = currHasNumeric
					? (curr.label.match(/^(\D*)/)?.[1] ?? '')
					: (next.label.match(/^(\D*)/)?.[1] ?? '');
				const postfix = currHasNumeric
					? (curr.label.replace(/^(\D*\d+\.?\d*)/, '').replace(/^(\.\d+)/, ''))
					: (next.label.replace(/^(\D*\d+\.?\d*)/, '').replace(/^(\.\d+)/, ''));
				return applyDefinReplacements(`${prefix}${formatted}${postfix}`, extraReplacements);
			}
			return applyDefinReplacements(String(value), extraReplacements);
		}
	}

	return applyDefinReplacements(String(value), extraReplacements);
}

export function formatValue(value: number, paramType: string): string {
	const p = getParam(paramType);
	if (!p) return String(value);

	console.log('formatValue', value, p);

	if (p.f && paramFormattingFunctions[p.f]) {
		try {
			return paramFormattingFunctions[p.f](value) || String(value);
		} catch {
			return String(value);
		}
	}
	if (p.defin && p.defin.length > 0) {
		const options = parseDefin(p.defin);
		return calcDefinOptions(value, options);
	}

	return String(value);
}

function getContextFromRef(
	refIndices: number[],
	params: ModuleDefinition['params'] | undefined,
	modeValues: number[] | undefined,
	modeDefs: ModuleDefinition['modes'] | undefined,
	values: number[],
	paramCount: number
): Record<string, number> {
	const context: Record<string, number> = {};
	if (!params) return context;
	for (let i = 1; i < refIndices.length; i++) {
		const idx = refIndices[i];
		if (idx < paramCount) {
			const param = params[idx];
			if (param) {
				context[param.type] = values[idx] ?? 64;
			}
		} else {
			const modeIdx = idx - paramCount;
			const modeDef = modeDefs?.[modeIdx];
			const modeValue = modeValues?.[modeIdx];
			if (modeDef && modeValue !== undefined) {
				context[modeDef.type] = modeValue;
			}
		}
	}
	return context;
}

function getDefinIndexFromContext(context: Record<string, number>, comments: string | undefined, maxIndex: number): number {
	if (!comments) return 0;
	const match = comments.match(/Determined by \[(\w+)\]/);
	if (!match) return 0;

	const delayRangeParam = match[1];
	const delayValue = context[delayRangeParam];
	if (delayValue === undefined) return 0;

	const andByMatch = comments.match(/and by \[(\w+)\]/);
	if (andByMatch) {
		const timeClkParam = andByMatch[1];
		const timeClkValue = context[timeClkParam];
		if (timeClkValue !== undefined) {
			return timeClkValue === 1 ? maxIndex : Math.min(delayValue, maxIndex);
		}
	}

	return Math.min(delayValue, maxIndex);
}

export function formatCombinedValue(
	refIndices: number[],
	funcName: string | undefined,
	params: ModuleDefinition['params'],
	values: number[],
	modeValues?: number[],
	modeDefs?: ModuleDefinition['modes']
): string {
	if (!params) return '';

	console.log('formatCombinedValue', values, modeValues);

	const paramCount = params.length;
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
		} catch (e) {
			console.error('Format error:', formatFunc, e);
		}
	}

	if (p.defin && p.defin.length > 1) {
		const context = getContextFromRef(refIndices, params, modeValues, modeDefs, values, paramCount);
		console.log('p.comments:', p.comments, 'p.defin.length:', p.defin.length, 'modeValues:', modeValues);
		const definIndex = getDefinIndexFromContext(context, p.comments, p.defin.length - 1);
		const options = parseDefin([p.defin[definIndex]]);
		console.log('context:', context, 'definIndex:', definIndex, 'options:', options);
		const value = values[refIndices[0]];
		const maxIndex = p.defin.length - 1;
		const isClkMode = definIndex === maxIndex;
		console.log('value:', value, 'calcDefinOptions result:', calcDefinOptions(value, options, undefined, isClkMode));
		return calcDefinOptions(value, options, undefined, isClkMode);
	}

	return refIndices.map((idx) => values[idx] ?? 64).join(' ');
}
