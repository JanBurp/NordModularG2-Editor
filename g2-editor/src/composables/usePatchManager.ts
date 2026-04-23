import { ref, computed, watch, type Ref, type ComputedRef } from "vue";

export interface Module {
	index: number;
	type: number;
	horiz: number;
	vert: number;
	pcnt?: number;
	lv?: number[];
	[key: string]: any;
}

export interface Cable {
	colour: number;
	[key: string]: any;
}

export interface Area {
	modules: Module[];
	cableList: Cable[];
	[key: string]: any;
}

export interface Patch {
	areas: [Area, Area];
	description?: {
		variation?: number;
		[key: string]: any;
	};
}

export type AreaType = "voice" | "fx";

export function usePatchManager() {
	const patch = ref<Patch>({
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [], cableList: [] },
		],
	});
	const patchName = ref<string>("");
	const variation = ref<number>(0);
	const selectedArea = ref<AreaType>("voice");

	// Area index helper
	const areaIndex = computed<number>(() => {
		return selectedArea.value === "voice" ? 1 : 0;
	});

	// Area modules
	const areaModules = (area: AreaType): Module[] => {
		const index = area === "voice" ? 1 : 0;
		if (!patch.value?.areas) return [];
		return patch.value.areas[index]?.modules || [];
	};

	// Area cables
	const areaCables = (area: AreaType): Cable[] => {
		const index = area === "voice" ? 1 : 0;
		if (!patch.value?.areas) return [];
		return patch.value.areas[index]?.cableList || [];
	};

	// Area counts
	const areaModulesCount = (area: AreaType): number => areaModules(area).length;
	const areaCablesCount = (area: AreaType): number => areaCables(area).length;

	// Current modules for selected area with variation applied
	const currentModules: ComputedRef<Module[]> = computed(() => {
		if (!patch.value?.areas) return [];
		const modules = patch.value.areas[areaIndex.value]?.modules || [];
		// Apply variation to parameter values
		return modules.map((m) => {
			if (!m.lv || !m.pcnt) {
				// Return module without lv if pcnt is not defined
				const { lv, ...rest } = m;
				return rest as Module;
			}
			const startIdx = variation.value * m.pcnt;
			const endIdx = startIdx + m.pcnt;
			return {
				...m,
				lv: m.lv.slice(startIdx, endIdx),
			};
		});
	});

	// Current cables for selected area
	const currentCables: ComputedRef<Cable[]> = computed(() => {
		if (!patch.value?.areas) return [];
		return patch.value.areas[areaIndex.value]?.cableList || [];
	});

	// Load patch from file
	function handleFileLoad(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const buffer = e.target?.result;
			if (!buffer || !(buffer instanceof ArrayBuffer)) return;

			// Dynamic import to avoid circular dependencies
			import("../parser/nmg2PatchParser.js").then(({ PatchParser }) => {
				const parser = new PatchParser(buffer);
				const parsedPatch = parser.parse() as Patch;
				patch.value = parsedPatch;
				patchName.value = file.name.replace(".pch2", "").replace(".prf2", "");
				selectedArea.value = "voice";
			});
		};
		reader.readAsArrayBuffer(file);
	}

	// Load patch from device slot — CLI returns pch2 section data (USB wrapper stripped in C).
	// A .pch2 file has: [name]\0[0x17][0x00][sections][crc]. The USB response has only
	// [sections][crc], so we prepend the minimal header to put sections at the right offset.
	async function loadFromHex(hex: string, name: string): Promise<void> {
		const sectionBytes = new Uint8Array(
			hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
		);
		const nameBytes = new TextEncoder().encode(name);
		const header = new Uint8Array(nameBytes.length + 3);
		header.set(nameBytes);
		header[nameBytes.length] = 0x00;
		header[nameBytes.length + 1] = 0x17;
		header[nameBytes.length + 2] = 0x00;
		const pch2 = new Uint8Array(header.length + sectionBytes.length);
		pch2.set(header, 0);
		pch2.set(sectionBytes, header.length);
		const buffer = pch2.buffer;
		const { PatchParser } = await import("../parser/nmg2PatchParser.js");
		patch.value = new PatchParser(buffer).parse() as Patch;
		patchName.value = name;
		selectedArea.value = "voice";
	}

	// Load patch from browser
	async function handlePatchSelect(filename: string): Promise<void> {
		if (typeof window === "undefined" || !window.electronAPI) return;

		try {
			const result = await window.electronAPI.patches.load(filename);
			if (result.success && result.data) {
				const buffer = new Uint8Array(result.data).buffer;
				const { PatchParser } = await import("../parser/nmg2PatchParser.js");
				const parser = new PatchParser(buffer);
				const parsedPatch = parser.parse() as Patch;
				patch.value = parsedPatch;
				patchName.value = filename.replace(".pch2", "").replace(".prf2", "");
				selectedArea.value = "voice";
			}
		} catch (err) {
			console.error("Failed to load patch:", err);
		}
	}

	// Watch for variation changes and update patch data
	watch(variation, (newVariation) => {
		if (patch.value?.description) {
			patch.value.description.variation = newVariation;
		}
	});

	return {
		// State
		patch,
		patchName,
		variation,
		selectedArea,
		// Computed
		currentModules,
		currentCables,
		// Helpers
		areaModules,
		areaCables,
		areaModulesCount,
		areaCablesCount,
		// Actions
		handleFileLoad,
		handlePatchSelect,
		loadFromHex,
	};
}
