// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeCableKey, removeCableByKey } from '@/renderer/cableRenderer';
import type { Cable } from '@/renderer/cableRenderer';

function makeCable(overrides: Partial<Cable> = {}): Cable {
	return { colour: 0, smod: 1, scon: 0, dmod: 2, dcon: 1, dir: 1, ...overrides };
}

function makeSvg(): SVGSVGElement {
	return document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
}

function appendPath(parent: SVGSVGElement, key: string): SVGPathElement {
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
	path.setAttribute('data-cable-key', key);
	parent.appendChild(path);
	return path;
}

describe('makeCableKey', () => {
	it('formats key as smod-scon-dmod-dcon', () => {
		expect(makeCableKey(makeCable({ smod: 1, scon: 0, dmod: 2, dcon: 1 }))).toBe('1-0-2-1');
	});

	it('handles zero indices', () => {
		expect(makeCableKey(makeCable({ smod: 0, scon: 0, dmod: 0, dcon: 0 }))).toBe('0-0-0-0');
	});

	it('handles large indices', () => {
		expect(makeCableKey(makeCable({ smod: 255, scon: 63, dmod: 255, dcon: 63 }))).toBe('255-63-255-63');
	});

	it('produces only digits and hyphens for normal cable data', () => {
		const key = makeCableKey(makeCable({ smod: 10, scon: 5, dmod: 20, dcon: 3 }));
		expect(key).toMatch(/^\d+-\d+-\d+-\d+$/);
	});
});

describe('removeCableByKey', () => {
	it('removes all elements matching the key', () => {
		const svg = makeSvg();
		const key = makeCableKey(makeCable());
		appendPath(svg, key);
		appendPath(svg, key);
		appendPath(svg, key);
		expect(svg.querySelectorAll(`[data-cable-key]`).length).toBe(3);
		removeCableByKey(svg, key);
		expect(svg.querySelectorAll(`[data-cable-key]`).length).toBe(0);
	});

	it('leaves elements with a different key untouched', () => {
		const svg = makeSvg();
		const key1 = makeCableKey(makeCable({ smod: 1, dmod: 2 }));
		const key2 = makeCableKey(makeCable({ smod: 3, dmod: 4 }));
		appendPath(svg, key1);
		appendPath(svg, key2);
		removeCableByKey(svg, key1);
		expect(svg.querySelectorAll(`[data-cable-key]`).length).toBe(1);
		expect(svg.querySelector(`[data-cable-key]`)!.getAttribute('data-cable-key')).toBe(key2);
	});

	it('does not throw when the key is not present', () => {
		const svg = makeSvg();
		expect(() => removeCableByKey(svg, '99-0-99-0')).not.toThrow();
	});

	it('documents current behavior: key with CSS metacharacters silently no-ops', () => {
		// Keys are built from integer fields, so metacharacters cannot arise in practice.
		// This test pins the existing behavior: a syntactically invalid selector is
		// silently ignored rather than throwing, so callers do not need to guard against it.
		const svg = makeSvg();
		appendPath(svg, 'safe-key');
		// A key with a bracket would produce an invalid attribute selector
		expect(() => removeCableByKey(svg, '1[0]2-1')).not.toThrow();
		// The safe-key element was not accidentally removed
		expect(svg.querySelectorAll(`[data-cable-key]`).length).toBe(1);
	});
});
