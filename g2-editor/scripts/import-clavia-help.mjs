#!/usr/bin/env node
// Converts the module help pages of the official Clavia editor (Mac v1.62 Help Book) into
// self-contained HTML fragments in doc/help/, shown by the Modules pane (useModuleHelp).
//
// Source: "Nord Modular G2 OS v1.62 Update.dmg" → Nord Modular G2 Editor.app/Contents/Resources/
// Nord Modular G2 Help/nmg2_ref_-_<module>.htm (RoboHelp HTML, Windows-1252), read with 7zz.
//
// Usage: node scripts/import-clavia-help.mjs <path-to-dmg> [outDir=../doc/help]
//
// Output: <Short>.html per module (Short = nmg2mods short name) plus the shared pages (common_<…>.html etc.)
// they link to. Links between converted pages become
// <a data-help="name" data-anchor="id">, other links become plain text. Images are inlined
// as data URIs. The module-panel picture at the top of each module page is dropped (the pane
// draws the module itself).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP_DIR = 'Modular G2 v1.62/Nord Modular G2 Editor.app/Contents/Resources/Nord Modular G2 Help';
const PAGE_PREFIX = 'nmg2_ref_-_';
// Official page slugs that differ from our lowercased module short name
const SLUG_ALIASES = { compressor: 'compress' };
// Pages shared by several modules ("Common LFO parameters" etc.); other
// manual chapters (synthesis basics, group overviews) are not converted and their links become text
const SHARED_PAGE = /^common_/;
const ALLOWED_TAGS = new Set(['h3', 'p', 'div', 'img', 'a', 'span', 'br', 'table', 'tr', 'td']);
const ALLOWED_STYLE_PROPS = new Set(['font-style', 'font-weight', 'font-variant', 'vertical-align', 'float']);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const [dmg, outDirArg] = process.argv.slice(2);
if (!dmg) {
	console.error('Usage: node scripts/import-clavia-help.mjs <path-to-dmg> [outDir]');
	process.exit(1);
}
const outDir = path.resolve(outDirArg ?? path.join(scriptDir, '..', '..', 'doc', 'help'));

const extract = (file) => execFileSync('7zz', ['e', '-so', dmg, `${HELP_DIR}/${file}`], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
const cp1252 = new TextDecoder('windows-1252');

const available = new Set(
	execFileSync('7zz', ['l', '-ba', '-slt', dmg], { maxBuffer: 1 << 26 })
		.toString()
		.split('\n')
		.filter((l) => l.startsWith(`Path = ${HELP_DIR}/`))
		.map((l) => l.slice(`Path = ${HELP_DIR}/`.length)),
);

// slug (official page name without prefix/extension) → output name
const outName = new Map();
const nmg2mods = fs.readFileSync(path.join(scriptDir, '..', 'src', 'renderer', 'nmg2mods.ts'), 'utf-8');
for (const [, short] of nmg2mods.matchAll(/\bshort: "([^"]+)"/g)) {
	const lower = short.toLowerCase();
	const slug = SLUG_ALIASES[lower] ?? lower;
	if (available.has(`${PAGE_PREFIX}${slug}.htm`)) outName.set(slug, short);
	else console.warn(`no official help page for ${short}`);
}
const moduleSlugs = new Set(outName.keys());

const imageCache = new Map();
function dataUri(src) {
	if (!imageCache.has(src)) {
		const mime = /\.gif$/i.test(src) ? 'image/gif' : 'image/jpeg';
		imageCache.set(src, `data:${mime};base64,${extract(src).toString('base64')}`);
	}
	return imageCache.get(src);
}

function parseAttrs(s) {
	const attrs = {};
	for (const [, k, v1, v2, v3] of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[k.toLowerCase()] = v1 ?? v2 ?? v3;
	return attrs;
}

function filterStyle(style) {
	return (style ?? '')
		.split(';')
		.map((d) => d.trim())
		.filter((d) => ALLOWED_STYLE_PROPS.has(d.split(':')[0].trim().toLowerCase()))
		.join('; ');
}

const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const attrStr = (attrs) =>
	Object.entries(attrs)
		.filter(([, v]) => v)
		.map(([k, v]) => ` ${k}="${esc(v)}"`)
		.join('');

/** Converts one page; returns [html, linked slugs]. */
function convertPage(slug) {
	let html = cp1252.decode(extract(`${PAGE_PREFIX}${slug}.htm`));
	html = html.replace(/\r/g, '');
	html = html.slice(html.search(/<body[^>]*>/i)).replace(/<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '');
	html = html.replace(/<!--[\s\S]*?-->/g, '');
	// Navigation chrome: "You are here" breadcrumbs and chapter down-links
	html = html.replace(/<div class="container_(Uplinks|Downlinks)"[\s\S]*?<\/div>/g, '');
	html = html.replace(/<p class="p(Uplinks|Downlinks)"[\s\S]*?<\/p>/g, '');
	// Module pages show the module panel (~263 px wide) before the first paragraph, sometimes
	// after another picture; later panel-width pictures are example patches and stay
	if (moduleSlugs.has(slug)) {
		const firstP = html.search(/<p\s/);
		const intro = html.slice(0, firstP).replace(/<div class="container_Image"(?:(?!<\/div>)[\s\S])*?width="2[56]\d"[\s\S]*?<\/div>/, '');
		html = intro + html.slice(firstP);
	}

	const linked = new Set();
	const aStack = []; // per open <a>: whether its closing tag is emitted
	const out = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_, close, rawTag, rest) => {
		let tag = rawTag.toLowerCase();
		if (tag === 'font') tag = 'span';
		if (!ALLOWED_TAGS.has(tag)) return '';
		if (close) {
			if (tag === 'a') return aStack.pop() ? '</a>' : '';
			return `</${tag}>`;
		}
		const a = parseAttrs(rest);
		if (tag === 'a') {
			const [, encoded, anchor] = (a.href ?? '').match(/^nmg2_ref_-_(.+?)\.htm(?:#(.*))?$/) ?? [];
			const target = encoded && decodeURIComponent(encoded);
			const name = a.name && !/\s/.test(a.name) ? `<span id="${esc(a.name)}"></span>` : '';
			const isPage = target && (moduleSlugs.has(target) || (SHARED_PAGE.test(target) && available.has(`${PAGE_PREFIX}${target}.htm`)));
			aStack.push(Boolean(isPage));
			if (!isPage) return name;
			linked.add(target);
			return `${name}<a${attrStr({ class: a.class, 'data-help': target, 'data-anchor': anchor })}>`;
		}
		if (tag === 'img') return `<img${attrStr({ src: dataUri(a.src), width: a.width, height: a.height, alt: '' })} />`;
		return `<${tag}${attrStr({ class: a.class, align: a.align, style: filterStyle(a.style), colspan: a.colspan, rowspan: a.rowspan })}>`;
	});
	return [out.replace(/[ \t]*\n[\s]*/g, '\n').replace(/[ \t]+/g, ' ').trim() + '\n', linked];
}

// Module pages first, then (transitively) the common pages they link to
const pages = new Map();
const queue = [...moduleSlugs];
while (queue.length) {
	const slug = queue.shift();
	if (pages.has(slug)) continue;
	const [html, linked] = convertPage(slug);
	pages.set(slug, html);
	for (const t of linked) if (!pages.has(t)) queue.push(t);
}

// Rewrite link targets from official slugs to our output names
for (const slug of pages.keys()) if (!outName.has(slug)) outName.set(slug, slug);
fs.mkdirSync(outDir, { recursive: true });
for (const [slug, html] of pages) {
	const fixed = html.replace(/data-help="([^"]+)"/g, (_, t) => `data-help="${esc(outName.get(t) ?? t)}"`);
	fs.writeFileSync(path.join(outDir, `${outName.get(slug)}.html`), fixed);
}
console.log(`wrote ${pages.size} pages (${moduleSlugs.size} modules) to ${outDir}`);
