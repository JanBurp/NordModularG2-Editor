import { it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pch2ToLibraryItem } from '@/parser/libraryFile';
import { getModule } from '@/renderer/nmg2mods';
const ROOT = '/Users/jan/Music/Gear/NordModularG2/Patches/_library';
it('layout', () => {
	let out = '';
	for (const dir of fs.readdirSync(ROOT).filter((d) => !d.startsWith('.'))) for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.pch2'))) {
		const e = pch2ToLibraryItem(Array.from(fs.readFileSync(path.join(ROOT, dir, f))));
		const minCol = Math.min(...e.modules.map((m) => m.horiz));
		const cols = new Map<number, string[]>();
		for (const m of e.modules) {
			const c = m.horiz - minCol;
			cols.set(c, [...(cols.get(c) ?? []), `${getModule(m.type)?.short}@${m.vert}`]);
		}
		const max = Math.max(...cols.keys());
		const empty = Array.from({ length: max + 1 }, (_, i) => i).filter((i) => !cols.has(i));
		out += `${dir}/${f}: cols=${max + 1} empty=[${empty}] counts=${[...cols.entries()].sort((a, b) => a[0] - b[0]).map(([c, l]) => `${c}:${l.length}`).join(' ')}\n`;
		if (cols.size === 2) for (const [c, l] of cols) if (l.length <= 4) out += `    col${c}: ${l.join(', ')}\n`;
	}
	fs.writeFileSync('/tmp/g2layout.txt', out);
});
