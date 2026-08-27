export const SectionType = {
	PATCH_DESC: 0x21,
	MODULE_LIST: 0x4a,
	CABLE_LIST: 0x52,
	PARAMETERS: 0x4d,
	PARAM_NAMES: 0x5b,
	MODULE_NAMES: 0x5a,
	CONTROLLERS: 0x60,
	KNOBS: 0x62,
	MORPH_PARAMS: 0x65,
	SEPARATOR: 0x6f,
	PERF_DATA: 0x11,
} as const;

// Fixed pseudo-module holding the 8 Morph Groups (location=2/"patch"). Params 0-7 are the
// morph dial values (handled elsewhere, via the PATCH_MORPH parameter section); params 8-15
// are the renamable per-group labels (group i's label = param 8+i), via $PARAM_NAMES/set-param-label.
export const PATCH_MORPH_MODULE_ID = 0x01;
