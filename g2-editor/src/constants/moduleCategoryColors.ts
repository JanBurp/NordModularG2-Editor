// Per-category accent colors, taken from the original Clavia G2 editor's RegisterCategory calls
// (CModuleFactory::CModuleFactory in G2Editor.c). Keys match ModuleDefinition.page.name.
export const MODULE_CATEGORY_COLORS: Record<string, string> = {
	'In/Out': '#909090',
	Note: '#8c02fd',
	Osc: '#ca0000',
	LFO: '#0000ca',
	Rnd: '#0096e6',
	Env: '#00bbbb',
	Filter: '#008284',
	FX: '#ea64b0',
	Delay: '#8359ff',
	Shaper: '#ce7173',
	Level: '#40a000',
	Mixer: '#ff8040',
	Switch: '#66d9ff',
	Logic: '#f5ea01',
	Seq: '#fecf41',
	MIDI: '#c08000',
	Hidden: '#9e9e9e', // not an original category
};

export function getCategoryColor(category: string): string {
	return MODULE_CATEGORY_COLORS[category] ?? '#9e9e9e';
}
