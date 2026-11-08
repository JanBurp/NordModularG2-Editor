// The Meter Graph's meters, kept in the patch notes as one generated first line:
//   [metergraph: V3.1 V3.2 F2.1-]
// V/F = Voice/FX area, module index, '.', meter number (1-based, as the chip label), '-' = hidden.
// Only a first line matching TAG exactly is ours; anything else is the user's text and is never changed.
import { TEXT_PAD_MAX } from '@/parser/nmg2PatchSerializer';

export interface NotesMeter {
	location: 0 | 1;
	moduleIndex: number;
	ledNo: number; // 0-based
	hidden: boolean;
}

const TAG = /^\[metergraph:((?: [VF]\d+\.\d+-?)*)\]$/;
const TOKEN = /([VF])(\d+)\.(\d+)(-?)/g;

export function formatMeterLine(meters: NotesMeter[]): string {
	if (meters.length === 0) return '';
	const tokens = meters.map((m) => `${m.location === 1 ? 'V' : 'F'}${m.moduleIndex}.${m.ledNo + 1}${m.hidden ? '-' : ''}`);
	return `[metergraph: ${tokens.join(' ')}]`;
}

// The notes split into our tag line (null if the first line isn't one) and the user's text after it.
function splitTag(text: string): { tag: RegExpExecArray | null; rest: string } {
	const nl = text.search(/\r?\n/);
	const first = nl === -1 ? text : text.slice(0, nl);
	const tag = TAG.exec(first);
	if (!tag) return { tag: null, rest: text };
	return { tag, rest: nl === -1 ? '' : text.slice(nl + (text[nl] === '\r' ? 2 : 1)) };
}

export function parseMeterLine(text: string): NotesMeter[] | null {
	const { tag } = splitTag(text);
	if (!tag) return null;
	return [...tag[1].matchAll(TOKEN)].map(([, area, mod, led, hidden]) => ({
		location: area === 'V' ? 1 : 0,
		moduleIndex: Number(mod),
		ledNo: Number(led) - 1,
		hidden: hidden === '-',
	}));
}

// Puts `line` on top of the user's text (replacing only our own old tag), or removes our tag when
// `line` is ''. If the tag doesn't fit the text pad, the user's text is returned without a tag and
// fits = false: the serializer cuts at `max`, and that cut must never fall on the user's text.
export function withMeterLine(text: string, line: string, max = TEXT_PAD_MAX): { text: string; fits: boolean } {
	const { rest } = splitTag(text);
	if (!line) return { text: rest, fits: true };
	const result = rest ? `${line}\n${rest}` : line;
	return result.length > max ? { text: rest, fits: false } : { text: result, fits: true };
}
