// Pure helpers for the "Parameter Pages" assignable-knob addressing scheme: 120 front-panel slots
// arranged as 3 Banks x 5 Pages (A-E) x 8 Knobs. A slot's bank/page/knob position is a pure
// arithmetic convention (not stored in the patch file — see ParamPageAssignment in types/patch.ts).

import type { ParamPageAssignment } from '../types/patch';

export const PAGE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
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
