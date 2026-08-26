// Per-category accent colors for the module picker, approximating the category-tab
// underline colors used in the original Clavia G2 editor. Keys match ModuleDefinition.page.name.
export const MODULE_CATEGORY_COLORS: Record<string, string> = {
	'In/Out': '#535156',
	Osc: '#d32f2f',
	Rnd: '#2979ff',
	Filter: '#00695c',
	Delay: '#7b1fa2',
	Level: '#388e3c',
	Switch: '#4fc3f7',
	Seq: '#ffb300',
	Note: '#8e24aa',
	LFO: '#1a237e',
	Env: '#26c6da',
	FX: '#e91e8c',
	Shaper: '#ad4a4a',
	Mixer: '#f57c00',
	Logic: '#fdd835',
	MIDI: '#795548',
	Hidden: '#9e9e9e',
};

export function getCategoryColor(category: string): string {
	return MODULE_CATEGORY_COLORS[category] ?? '#9e9e9e';
}
