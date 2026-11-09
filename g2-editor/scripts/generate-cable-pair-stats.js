#!/usr/bin/env node
/*
 * Generates src/renderer/cablePairStats.json: how often each output→input jack pair is cabled
 * between two modules in the same column (source above destination) across a folder of patches.
 * Used by auto-suggest cable (useGhostCable.ts) to rank and filter its blue/yellow and
 * new→below suggestions.
 *
 * Usage: node scripts/generate-cable-pair-stats.js <patches-folder>
 *
 * Reads every .pch2 and .prf2 (all 4 slots) under the folder, skips identical patches (same
 * modules + cables), keeps pairs seen at least MIN_COUNT times.
 * Output: [[srcType, outputIdx, dstType, inputIdx, count], …], highest count first.
 *
 * Fully regenerates the output file — never hand-edit cablePairStats.json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const MIN_COUNT = 5;

const folder = process.argv[2];
if (!folder) {
	console.error('Usage: node scripts/generate-cable-pair-stats.js <patches-folder>');
	process.exit(1);
}

// The parser and module database are TypeScript: bundle them into a temporary CommonJS file.
const root = path.join(__dirname, '..');
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'g2-cable-stats-')), 'bundle.js');
esbuild.buildSync({
	stdin: {
		contents: "export { PatchParser } from './src/parser/nmg2PatchParser'; export { getModule } from './src/renderer/nmg2mods';",
		resolveDir: root,
		loader: 'ts',
	},
	alias: { '@': path.join(root, 'src') },
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: bundle,
	logLevel: 'error',
});
const { PatchParser, getModule } = require(bundle);

function patchFiles(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return patchFiles(p);
		return /\.(pch2|prf2)$/i.test(e.name) ? [p] : [];
	});
}

const counts = new Map();
const seen = new Set();
let unreadable = 0;
for (const file of patchFiles(folder)) {
	let patches;
	try {
		const b = fs.readFileSync(file);
		const parser = new PatchParser(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
		patches = /\.prf2$/i.test(file) ? (parser.parsePrf2()?.patches ?? []) : [parser.parse()];
	} catch {
		unreadable++;
		continue;
	}
	for (const patch of patches) {
		const key = JSON.stringify(patch.areas.map((a) => [a.modules.map((m) => [m.type, m.horiz, m.vert]), a.cableList]));
		if (seen.has(key)) continue;
		seen.add(key);
		for (const area of patch.areas) {
			const mods = new Map(area.modules.map((m) => [m.index, m]));
			for (const c of area.cableList) {
				if (c.dir !== 1) continue;
				const src = mods.get(c.smod);
				const dst = mods.get(c.dmod);
				if (!src || !dst || src === dst || src.horiz !== dst.horiz || src.vert >= dst.vert) continue;
				if (!getModule(src.type)?.outputs?.[c.scon] || !getModule(dst.type)?.inputs?.[c.dcon]) continue;
				const k = `${src.type}:${c.scon}:${dst.type}:${c.dcon}`;
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}
		}
	}
}

const rows = [...counts]
	.filter(([, n]) => n >= MIN_COUNT)
	.sort((a, b) => b[1] - a[1])
	.map(([k, n]) => [...k.split(':').map(Number), n]);
const out = path.join(root, 'src/renderer/cablePairStats.json');
fs.writeFileSync(out, `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
console.log(`${seen.size} unique patches (${unreadable} unreadable files), ${rows.length} pairs → ${path.relative(root, out)}`);
