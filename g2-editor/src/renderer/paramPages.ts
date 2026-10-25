// Pure helpers for the "Parameter Pages" assignable-knob addressing scheme: 120 front-panel slots
// arranged as 3 Banks x 5 Pages (A-E) x 8 Knobs. A slot's bank/page/knob position is a pure
// arithmetic convention (not stored in the patch file — see ParamPageAssignment in types/patch.ts).

import type { GlobalParamPageAssignment, ParamPageAssignment } from '../types/patch';

export const PAGE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
export const PAGE_NAMES = ['Osc', 'LFO', 'Env', 'Filter', 'Effect'] as const;
export const BANK_COUNT = 3;
export const PAGE_COUNT = 5;
export const KNOBS_PER_PAGE = 8;
export const TOTAL_KNOB_SLOTS = BANK_COUNT * PAGE_COUNT * KNOBS_PER_PAGE; // 120

// Address decomposition confirmed from BVE Delphi source (DX4/Frames/UnitParam.pas):
// GetKnobIndexOffset = rbPageIndex.Value*8 + rbPage.Value*8*3, where rbPage (divisor 24, range
// 0-4) is the Page-letter control and rbPageIndex (divisor 8 within 24, range 0-2) is the Bank
// control — despite Delphi's own field names suggesting the opposite. So Page is the outer axis
// (stride 24), Bank the middle axis (stride 8), Knob the inner axis.
export function slotIndexFor(bank: number, page: number, knob: number): number {
	return page * 24 + bank * 8 + knob;
}

export function slotIndexToBankPageKnob(slotIndex: number): { bank: number; page: number; knob: number } {
	return { page: Math.floor(slotIndex / 24), bank: Math.floor((slotIndex % 24) / 8), knob: slotIndex % 8 };
}

export function paramPageFor(assignments: ParamPageAssignment[], location: 0 | 1, moduleIndex: number, paramIndex: number): ParamPageAssignment | undefined {
	return assignments.find((a) => a.location === location && a.moduleIndex === moduleIndex && a.paramIndex === paramIndex);
}

// The module params a Parameter Page knob map drives, in knob order: each (non-LED) knob's own
// param, plus the param its button targets when that is a different param not itself on a knob.
// Ported from G2Editor.c's CPatch::InternalAutoAssignMIDICtrlFromKnobMap /
// InternalDeassignMIDICtrlFromKnobMap (the Parameter Overview's Assign MIDI / Clear MIDI).
// `slotOf` resolves an assignment's target patch; `buttonParamOf` returns -1 for "no button".
export function knobMapParams<A extends ParamPageAssignment | GlobalParamPageAssignment, S>(
	assignments: A[],
	slotOf: (a: A) => S,
	buttonParamOf: (a: A) => number,
): { slot: S; location: 0 | 1 | 2; moduleIndex: number; paramIndex: number }[] {
	const knobs = assignments.filter((a) => !a.isLed).sort((a, b) => a.slotIndex - b.slotIndex);
	const onKnob = (a: A, paramIndex: number) =>
		knobs.some((k) => slotOf(k) === slotOf(a) && k.location === a.location && k.moduleIndex === a.moduleIndex && k.paramIndex === paramIndex);
	return knobs.flatMap((a) => {
		const target = { slot: slotOf(a), location: a.location, moduleIndex: a.moduleIndex };
		const button = buttonParamOf(a);
		const withButton = button !== -1 && button !== a.paramIndex && !onKnob(a, button);
		return withButton
			? [
					{ ...target, paramIndex: a.paramIndex },
					{ ...target, paramIndex: button },
				]
			: [{ ...target, paramIndex: a.paramIndex }];
	});
}
