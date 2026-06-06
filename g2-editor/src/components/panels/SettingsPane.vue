<template>
	<div class="flex flex-col gap-1">
		<Collapsible title="Editor Settings">
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
		<Collapsible title="Synth Settings">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.synthName">
					<TextInput :model-value="device.device?.synthName ?? ''" @update:model-value="device.setSynthName($event)" />
				</SettingsRow>

				<p class="settings-subheader">MIDI Channels</p>
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
					<TextInput :model-value="device.device?.performance?.name ?? ''" @update:model-value="device.setPerfName($event)" />
				</SettingsRow>
				<SettingsRow :label="L.bpm">
					<NumberInput :model-value="device.bpm" :min="30" :max="240" class="w-16" @update:model-value="device.setBpm($event)" />
				</SettingsRow>
				<SettingsRow :label="L.clockRunning">
					<CheckBox :model-value="device.clockRunning" @update:model-value="device.setClockRunning($event)" />
				</SettingsRow>
				<!-- <SettingsRow :label="L.kbSplit">
					<CheckBox :model-value="device.device?.performance?.kbSplit ?? false" @update:model-value="device.setKbSplit($event)" />
				</SettingsRow> -->
				<SettingsRow :label="L.rangeEnable">
					<CheckBox :model-value="device.device?.performance?.rangeEnable ?? false" @update:model-value="device.setRangeEnable($event)" />
				</SettingsRow>

				<p class="settings-subheader">Slot Info</p>
				<div class="grid text-xs text-neutral-500 mb-0.5 px-0.5" style="grid-template-columns: 1.25rem 3rem 1fr 1fr 1fr 1.75rem 1.75rem; gap: 0.25rem">
					<span></span><span></span>
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
						class="px-0 min-w-12"
						@update:model-value="device.setSlotRangeLower(slot, $event)"
					/>
					<NumberInput
						:model-value="slotEntry(slot)?.range?.upper ?? 127"
						:min="0"
						:max="127"
						class="px-0 min-w-12"
						@update:model-value="device.setSlotRangeUpper(slot, $event)"
					/>
				</div>
			</div>
		</Collapsible>

		<Collapsible v-if="currentPatch" title="Patch Settings">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.patchName">
					<TextInput :model-value="slotsStore.getPatchName(uiStore.slotInFocus)" @update:model-value="slotsStore.setPatchName($event)" />
				</SettingsRow>

				<!-- <p class="settings-subheader">Variation Parameters</p>
				<SettingsRow v-for="param in PATCH_PARAMS" :key="param.key" :label="param.label">
					<NumberInput :model-value="patchParam(param.key)" class="w-16" @update:model-value="slotsStore.setPatchParam(uiStore.variation, param.key, $event)" />
				</SettingsRow> -->
			</div>
		</Collapsible>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Collapsible from '@/components/common/Collapsible.vue';
	import SettingsRow from '@/components/common/SettingsRow.vue';
	import TextInput from '@/components/common/TextInput.vue';
	import NumberInput from '@/components/common/NumberInput.vue';
	import CheckBox from '@/components/common/CheckBox.vue';
	import { useDeviceStore } from '@/store/device';
	import { useSettingsStore } from '@/store/settings';
	import { useBrowserStore } from '@/store/browser';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { SLOT_LABELS, SETTINGS_LABELS } from '@/constants';
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

	const MIDI_SLOTS: { key: 'A' | 'B' | 'C' | 'D' | 'global'; label: string }[] = [
		{ key: 'A', label: L.midiSlotA },
		{ key: 'B', label: L.midiSlotB },
		{ key: 'C', label: L.midiSlotC },
		{ key: 'D', label: L.midiSlotD },
		{ key: 'global', label: L.midiGlobal },
	];

	const PATCH_PARAMS: { key: keyof PatchParamVariation; label: string }[] = [
		{ key: 'patchVol', label: L.patchVol },
		{ key: 'activeMuted', label: L.patchActiveMuted },
		{ key: 'glide', label: L.patchGlide },
		{ key: 'glideTime', label: L.patchGlideTime },
		{ key: 'bend', label: L.patchBend },
		{ key: 'semi', label: L.patchSemi },
		{ key: 'vibrato', label: L.patchVibrato },
		{ key: 'cents', label: L.patchCents },
		{ key: 'rate', label: L.patchRate },
		{ key: 'arpeggiator', label: L.patchArpeggiator },
		{ key: 'arpTime', label: L.patchArpTime },
		{ key: 'arpType', label: L.patchArpType },
		{ key: 'octaveShift', label: L.patchOctaveShift },
		{ key: 'sustain', label: L.patchSustain },
		{ key: 'octaves', label: L.patchOctaves },
	];

	function slotEntry(slot: SlotLabel) {
		return device.device?.slots.find((s) => s.slot === slot);
	}

	function patchParam(key: keyof PatchParamVariation): number {
		const val = slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.patch?.[key];
		return typeof val === 'number' ? val : 0;
	}
</script>
