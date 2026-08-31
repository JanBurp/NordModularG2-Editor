import { describe, expect, it } from 'vitest';
import { getButtonParamIndex, getButtonParamModuleIds, getButtonParamsForModule } from '../buttonParams';
import { getModule } from '../nmg2mods';

describe('getButtonParamIndex', () => {
	it('returns -1 when the param explicitly has no button function', () => {
		expect(getButtonParamIndex(3, 0)).toBe(-1);
	});

	it('returns a different paramIndex for a genuine cross-reference', () => {
		expect(getButtonParamIndex(7, 0)).toBe(4);
		expect(getButtonParamIndex(7, 1)).toBe(2);
		expect(getButtonParamIndex(145, 0)).toBe(16); // SeqVal Seq1Step1 -> Seq2Step1
	});

	it('returns undefined for self-mirroring entries (omitted from the table by design)', () => {
		expect(getButtonParamIndex(145, 16)).toBeUndefined(); // self-reference; caller mirrors 16 anyway
		expect(getButtonParamIndex(4, 1)).toBeUndefined(); // module 4 is fully self-mirroring
	});

	it('returns undefined for an (moduleId, paramIndex) not present at all', () => {
		expect(getButtonParamIndex(999999, 0)).toBeUndefined();
	});
});

describe('buttonParams data integrity against nmg2mods.ts', () => {
	it('every stored moduleId exists as a real module', () => {
		for (const id of getButtonParamModuleIds()) {
			expect(getModule(id), `moduleId ${id} not found in nmg2mods.ts`).toBeDefined();
		}
	});

	it("every stored paramIndex/buttonParamIndex is within that module's params array bounds", () => {
		for (const id of getButtonParamModuleIds()) {
			const def = getModule(id)!;
			const len = def.params?.length ?? 0;
			const table = getButtonParamsForModule(id)!;
			for (const [paramIndexStr, buttonParamIndex] of Object.entries(table)) {
				const paramIndex = Number(paramIndexStr);
				expect(paramIndex, `module ${id} paramIndex ${paramIndex} out of range`).toBeLessThan(len);
				if (buttonParamIndex !== -1) {
					expect(buttonParamIndex, `module ${id} buttonParamIndex ${buttonParamIndex} out of range`).toBeLessThan(len);
				}
			}
		}
	});
});
