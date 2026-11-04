import { PatchParser, stripFileHeader } from './nmg2PatchParser';
import { serializePatch, serializePerformance, pch2FileBytes, prf2FileBytes, PCH2_TEXT_HEADER, PRF2_TEXT_HEADER } from './nmg2PatchSerializer';
import { FILE_VERSION_CURRENT, FILE_VERSION_OLDEST } from './fileVersion';
import { extractVariations } from '@/store/slotHelpers';

/* A .pch2/.prf2 file in an old format the parser converts (19-22), re-written in the current format
 * with the official text header; null for a current file, or one too old to convert (sent as it is). */
export function currentFormatFile(file: Uint8Array): { data: number[]; oldVersion: number } | null {
	const oldVersion = file[file.indexOf(0) + 1];
	if (!(oldVersion >= FILE_VERSION_OLDEST && oldVersion < FILE_VERSION_CURRENT)) return null;
	const parser = new PatchParser(file.slice().buffer);
	const template = stripFileHeader(file);
	const prf2 = parser.parsePrf2();
	if (prf2) {
		const rawHex = serializePerformance(prf2.patches, template, prf2.patches.map(extractVariations), prf2.globalParamPages);
		return { data: prf2FileBytes(PRF2_TEXT_HEADER, rawHex), oldVersion };
	}
	const patch = parser.parse();
	return { data: pch2FileBytes(PCH2_TEXT_HEADER, serializePatch('', patch, template, extractVariations(patch))), oldVersion };
}

// Toast text after old-format files were converted on their way to the G2's memory.
export const convertedNote = (count: number) =>
	`${count === 1 ? '1 file was' : `${count} files were`} converted from an old file format before writing to the G2.`;
