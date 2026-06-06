<template>
	<div class="flex flex-col gap-1">
		<Collapsible title="Editor Settings" :default-open="false">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.editorPath">
					<div class="flex gap-1 flex-1 items-center">
						<div class="w-1/4">
							<button class="settings-input px-2 cursor-pointer" @click="browser.chooseDiskFolder()">…</button>
						</div>
						<div class="w-3/4">
							<TextInput :model-value="settings.path" @update:model-value="settings.setPath($event)" />
						</div>
					</div>
				</SettingsRow>
				<SettingsRow :label="L.editorHiddenModules">
					<CheckBox :model-value="settings.hidden_modules" @update:model-value="settings.setHiddenModules($event)" />
				</SettingsRow>
			</div>
		</Collapsible>
		<Collapsible title="Synth Settings" :default-open="false">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.synthName">
					<TextInput :model-value="device.device?.synthName ?? ''" @update:model-value="device.setSynthName($event)" />
				</SettingsRow>

				<p class="settings-subheader">MIDI Channels:</p>
				<SettingsRow v-for="slot in MIDI_SLOTS" :key="slot.key" :label="slot.label">
					<NumberInput
						:model-value="device.device?.midi.slots[slot.key] ?? 1"
						:min="1"
						:max="16"
						class="w-16"
						@update:model-value="device.setMidiSlot(slot.key, $event)"
					/>
				</SettingsRow>

				<!-- <p class="settings-subheader">MIDI Settings</p>
				<SettingsRow :label="L.midiSysex">
					<NumberInput :model-value="device.device?.midi.sysex ?? 0" class="w-16" @update:model-value="device.setMidiSysex($event)" />
				</SettingsRow>
				<SettingsRow :label="L.midiPrgCh">
					<TextInput :model-value="device.device?.midi.prgch ?? ''" class="w-16" @update:model-value="device.setMidiPrgCh($event)" />
				</SettingsRow>
				<SettingsRow :label="L.midiLocal">
					<CheckBox :model-value="device.device?.midi.local ?? false" @update:model-value="device.setMidiLocal($event)" />
				</SettingsRow>
				<SettingsRow :label="L.midiClkSend">
					<CheckBox :model-value="device.device?.midi.clkse ?? false" @update:model-value="device.setMidiClkSend($event)" />
				</SettingsRow>
				<SettingsRow :label="L.midiClkReceive">
					<CheckBox :model-value="device.device?.midi.clkre ?? false" @update:model-value="device.setMidiClkReceive($event)" />
				</SettingsRow>

				<p class="settings-subheader">Tuning</p>
				<SettingsRow :label="L.tuningSemi">
					<NumberInput :model-value="device.device?.tuning.semi ?? 0" class="w-16" @update:model-value="device.setTuningSemi($event)" />
				</SettingsRow>
				<SettingsRow :label="L.tuningCent">
					<NumberInput :model-value="device.device?.tuning.cent ?? 0" class="w-16" @update:model-value="device.setTuningCent($event)" />
				</SettingsRow>

				<p class="settings-subheader">Pedal</p>
				<SettingsRow :label="L.pedalPolarity">
					<CheckBox :model-value="device.device?.pedal.polarity ?? false" @update:model-value="device.setPedalPolarity($event)" />
				</SettingsRow>
				<SettingsRow :label="L.pedalGain">
					<NumberInput :model-value="device.device?.pedal.gain ?? 0" class="w-16" @update:model-value="device.setPedalGain($event)" />
				</SettingsRow> -->
			</div>
		</Collapsible>

		<Collapsible v-if="isPerformanceMode" title="Performance Settings">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.perfName">
					<TextInput
						:model-value="device.device?.performance?.name ?? ''"
						maxlength="16"
						:debounce="500"
						@update:model-value="device.setPerfName($event)"
					/>
				</SettingsRow>
				<SettingsRow :label="L.bpm">
					<NumberInput :model-value="device.bpm" :min="30" :max="240" class="w-16" @update:model-value="device.setBpm($event)" />
				</SettingsRow>
				<SettingsRow :label="L.clockRunning">
					<CheckBox :model-value="device.clockRunning" @update:model-value="device.setClockRunning($event)" />
				</SettingsRow>
				<SettingsRow :label="L.rangeEnable">
					<CheckBox :model-value="device.device?.performance?.rangeEnable ?? false" @update:model-value="device.setRangeEnable($event)" />
				</SettingsRow>

				<p class="settings-subheader">Slot Info:</p>
				<div class="grid text-xs text-neutral-500 mb-0.5 px-0.5" style="grid-template-columns: 1.25rem 3rem 1fr 1fr 1fr 1.75rem 1.75rem; gap: 0.25rem">
					<span></span>
					<span class="text-center">{{ L.slotActive }}</span>
					<span class="text-center">{{ L.slotKey }}</span>
					<span class="text-center">{{ L.slotHold }}</span>
					<span class="text-center">{{ L.slotRangeLower }}</span>
					<span class="text-center">{{ L.slotRangeUpper }}</span>
				</div>
				<div
					v-for="slot in SLOT_LABELS"
					:key="slot"
					class="grid items-center text-xs px-0.5 py-0.5"
					style="grid-template-columns: 1.25rem 3rem 1fr 1fr 1fr 1.75rem 1.75rem; gap: 0.25rem"
				>
					<span class="text-neutral-300 font-medium">{{ slot }}</span>
					<span class="flex justify-center">
						<CheckBox :model-value="slotEntry(slot)?.active ?? false" @update:model-value="device.toggleSlotActive(slot)" />
					</span>
					<span class="flex justify-center">
						<CheckBox :model-value="slotEntry(slot)?.key ?? false" @update:model-value="device.toggleSlotKey(slot)" />
					</span>
					<span class="flex justify-center">
						<CheckBox :model-value="slotEntry(slot)?.hold ?? false" @update:model-value="device.setSlotHold(slot, $event)" />
					</span>
					<NumberInput
						:model-value="slotEntry(slot)?.range?.lower ?? 0"
						:min="0"
						:max="127"
						:midi-note="true"
						class="px-0 min-w-14"
						@update:model-value="device.setSlotRangeLower(slot, $event)"
					/>
					<NumberInput
						:model-value="slotEntry(slot)?.range?.upper ?? 127"
						:min="0"
						:max="127"
						:midi-note="true"
						class="px-0 min-w-14"
						@update:model-value="device.setSlotRangeUpper(slot, $event)"
					/>
				</div>
			</div>
		</Collapsible>

		<Collapsible v-if="currentPatch" title="Patch Settings">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.patchName">
					<TextInput
						:model-value="slotsStore.getPatchName(uiStore.slotInFocus)"
						maxlength="16"
						:debounce="500"
						@update:model-value="slotsStore.setPatchName($event)"
					/>
				</SettingsRow>
				<SettingsRow :label="L.patchCategory">
					<Select v-model="selectedCategory" :options="soundCategories" />
				</SettingsRow>

				<template v-for="group in PATCH_PARAM_GROUPS" :key="group.header">
					<p class="settings-subheader">{{ group.header }}</p>
					<SettingsRow v-for="param in group.params" :key="param.key" :label="param.label">
						<CheckBox
							v-if="param.boolean"
							:model-value="!!patchParam(param.key)"
							@update:model-value="slotsStore.setPatchParam(uiStore.variation, param.key, $event ? 1 : 0)"
						/>
						<NumberInput
							v-else
							:model-value="patchParam(param.key)"
							class="w-16"
							@update:model-value="slotsStore.setPatchParam(uiStore.variation, param.key, $event)"
						/>
					</SettingsRow>
				</template>
			</div>
		</Collapsible>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import Collapsible from '@/components/common/Collapsible.vue';
	import SettingsRow from '@/components/common/SettingsRow.vue';
	import TextInput from '@/components/common/TextInput.vue';
	import NumberInput from '@/components/common/NumberInput.vue';
	import CheckBox from '@/components/common/CheckBox.vue';
	import Select from '@/components/common/Select.vue';
	import { useDeviceStore } from '@/store/device';
	import { useSettingsStore } from '@/store/settings';
	import { useBrowserStore } from '@/store/browser';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { SLOT_LABELS, SETTINGS_LABELS, SOUND_CATEGORIES as soundCategories } from '@/constants';
	import type { SlotLabel } from '@/types';
	import type { PatchParamVariation } from '@/types/patch';

	const L = SETTINGS_LABELS;

	const device = useDeviceStore();
	const settings = useSettingsStore();
	const browser = useBrowserStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const isPerformanceMode = computed(() => device.device?.mode === 'Performance');
	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	const selectedCategory = ref<number>(0);
	watch(
		() => (currentPatch.value as any)?.description?.category,
		(cat) => { if (cat !== undefined && cat !== null) selectedCategory.value = cat; },
		{ immediate: true },
	);
	watch(selectedCategory, (cat) => {
		const desc = (currentPatch.value as any)?.description;
		if (desc) { desc.category = cat; slotsStore.setPatchDescription(); }
	});

	const MIDI_SLOTS: { key: 'A' | 'B' | 'C' | 'D' | 'global'; label: string }[] = [
		{ key: 'A', label: L.midiSlotA },
		{ key: 'B', label: L.midiSlotB },
		{ key: 'C', label: L.midiSlotC },
		{ key: 'D', label: L.midiSlotD },
		{ key: 'global', label: L.midiGlobal },
	];

	const PATCH_PARAM_GROUPS: { header: string; params: { key: keyof PatchParamVariation; label: string; boolean?: boolean }[] }[] = [
		{ header: 'Arpeggiator', params: [
			{ key: 'arpeggiator', label: 'On/Off', boolean: true },
			{ key: 'arpTime',     label: 'Time' },
			{ key: 'arpType',     label: 'Mode' },
			{ key: 'octaves',     label: 'Octaves' },
		]},
		{ header: 'Vibrato', params: [
			{ key: 'vibrato', label: 'Source' },
			{ key: 'cents',   label: 'Rate' },
		]},
		{ header: 'Glide', params: [
			{ key: 'glide',     label: 'Type' },
			{ key: 'glideTime', label: 'Time' },
		]},
		{ header: 'Bend', params: [
			{ key: 'bend', label: 'On/Off', boolean: true },
			{ key: 'semi', label: 'Semitones' },
		]},
		{ header: 'Octave Shift', params: [
			{ key: 'octaveShift', label: 'Shift' },
		]},
		{ header: 'Level', params: [
			{ key: 'patchVol',    label: 'Volume' },
			{ key: 'activeMuted', label: 'Active', boolean: true },
		]},
	];

	function slotEntry(slot: SlotLabel) {
		return device.device?.slots.find((s) => s.slot === slot);
	}

	function patchParam(key: keyof PatchParamVariation): number {
		return slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.patch?.[key] ?? 0;
	}
</script>
