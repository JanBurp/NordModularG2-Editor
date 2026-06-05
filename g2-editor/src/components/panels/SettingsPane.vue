<template>
	<div class="flex flex-col gap-1">
		<Collapsible title="Synth Settings">
			<div class="flex flex-col gap-1">
				<div class="settings-row">
					<span>{{ L.synthName }}</span>
					<input :value="device.device?.synthName ?? ''" class="settings-input" @input="device.setSynthName(($event.target as HTMLInputElement).value)" />
				</div>

				<p class="settings-subheader">MIDI Channels</p>
				<div v-for="slot in MIDI_SLOTS" :key="slot.key" class="settings-row">
					<span>{{ slot.label }}</span>
					<input type="number" :value="device.device?.midi.slots[slot.key]" class="settings-input w-16" @change="device.setMidiSlot(slot.key, +($event.target as HTMLInputElement).value)" />
				</div>

				<p class="settings-subheader">MIDI Settings</p>
				<div class="settings-row">
					<span>{{ L.midiSysex }}</span>
					<input type="number" :value="device.device?.midi.sysex" class="settings-input w-16" @change="device.setMidiSysex(+($event.target as HTMLInputElement).value)" />
				</div>
				<div class="settings-row">
					<span>{{ L.midiPrgCh }}</span>
					<input :value="device.device?.midi.prgch ?? ''" class="settings-input w-16" @input="device.setMidiPrgCh(($event.target as HTMLInputElement).value)" />
				</div>
				<div class="settings-row">
					<span>{{ L.midiLocal }}</span>
					<input type="checkbox" :checked="device.device?.midi.local" @change="device.setMidiLocal(($event.target as HTMLInputElement).checked)" />
				</div>
				<div class="settings-row">
					<span>{{ L.midiClkSend }}</span>
					<input type="checkbox" :checked="device.device?.midi.clkse" @change="device.setMidiClkSend(($event.target as HTMLInputElement).checked)" />
				</div>
				<div class="settings-row">
					<span>{{ L.midiClkReceive }}</span>
					<input type="checkbox" :checked="device.device?.midi.clkre" @change="device.setMidiClkReceive(($event.target as HTMLInputElement).checked)" />
				</div>

				<p class="settings-subheader">Tuning</p>
				<div class="settings-row">
					<span>{{ L.tuningSemi }}</span>
					<input type="number" :value="device.device?.tuning.semi" class="settings-input w-16" @change="device.setTuningSemi(+($event.target as HTMLInputElement).value)" />
				</div>
				<div class="settings-row">
					<span>{{ L.tuningCent }}</span>
					<input type="number" :value="device.device?.tuning.cent" class="settings-input w-16" @change="device.setTuningCent(+($event.target as HTMLInputElement).value)" />
				</div>

				<p class="settings-subheader">Pedal</p>
				<div class="settings-row">
					<span>{{ L.pedalPolarity }}</span>
					<input type="checkbox" :checked="device.device?.pedal.polarity" @change="device.setPedalPolarity(($event.target as HTMLInputElement).checked)" />
				</div>
				<div class="settings-row">
					<span>{{ L.pedalGain }}</span>
					<input type="number" :value="device.device?.pedal.gain" class="settings-input w-16" @change="device.setPedalGain(+($event.target as HTMLInputElement).value)" />
				</div>
			</div>
		</Collapsible>

		<Collapsible v-if="isPerformanceMode" title="Performance Settings">
			<div class="flex flex-col gap-1">
				<div class="settings-row">
					<span>{{ L.perfName }}</span>
					<input :value="device.device?.performance?.name ?? ''" class="settings-input" @input="device.setPerfName(($event.target as HTMLInputElement).value)" />
				</div>
				<div class="settings-row">
					<span>{{ L.bpm }}</span>
					<input type="number" min="30" max="240" :value="device.bpm" class="settings-input w-16" @change="device.setBpm(+($event.target as HTMLInputElement).value)" />
				</div>
				<div class="settings-row">
					<span>{{ L.clockRunning }}</span>
					<input type="checkbox" :checked="device.clockRunning" @change="device.setClockRunning(($event.target as HTMLInputElement).checked)" />
				</div>
				<div class="settings-row">
					<span>{{ L.kbSplit }}</span>
					<input type="checkbox" :checked="device.device?.performance?.kbSplit" @change="device.setKbSplit(($event.target as HTMLInputElement).checked)" />
				</div>
				<div class="settings-row">
					<span>{{ L.rangeEnable }}</span>
					<input type="checkbox" :checked="device.device?.performance?.rangeEnable" @change="device.setRangeEnable(($event.target as HTMLInputElement).checked)" />
				</div>

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
					<span class="text-neutral-500 truncate text-xs">{{ slotEntry(slot)?.name ?? '' }}</span>
					<span class="flex justify-center"><input type="checkbox" :checked="slotEntry(slot)?.active" @change="device.toggleSlotActive(slot)" /></span>
					<span class="flex justify-center"><input type="checkbox" :checked="slotEntry(slot)?.key" @change="device.toggleSlotKey(slot)" /></span>
					<span class="flex justify-center"><input type="checkbox" :checked="slotEntry(slot)?.hold" @change="device.setSlotHold(slot, ($event.target as HTMLInputElement).checked)" /></span>
					<input type="number" min="0" max="127" :value="slotEntry(slot)?.range?.lower ?? 0" class="settings-input text-center px-0" @change="device.setSlotRangeLower(slot, +($event.target as HTMLInputElement).value)" />
					<input type="number" min="0" max="127" :value="slotEntry(slot)?.range?.upper ?? 127" class="settings-input text-center px-0" @change="device.setSlotRangeUpper(slot, +($event.target as HTMLInputElement).value)" />
				</div>
			</div>
		</Collapsible>

		<Collapsible v-if="currentPatch" title="Patch Settings">
			<div class="flex flex-col gap-1">
				<div class="settings-row">
					<span>{{ L.patchName }}</span>
					<input :value="slotsStore.getPatchName(uiStore.slotInFocus)" class="settings-input" @input="slotsStore.setPatchName(($event.target as HTMLInputElement).value)" />
				</div>

				<p class="settings-subheader">Variation Parameters</p>
				<div v-for="param in PATCH_PARAMS" :key="param.key" class="settings-row">
					<span>{{ param.label }}</span>
					<input
						type="number"
						:value="patchParam(param.key)"
						class="settings-input w-16"
						@change="slotsStore.setPatchParam(uiStore.variation, param.key, +($event.target as HTMLInputElement).value)"
					/>
				</div>
			</div>
		</Collapsible>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Collapsible from '@/components/common/Collapsible.vue';
	import { useDeviceStore } from '@/store/device';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { SLOT_LABELS, SETTINGS_LABELS } from '@/constants';
	import type { SlotLabel } from '@/types';
	import type { PatchParamVariation } from '@/types/patch';

	const L = SETTINGS_LABELS;

	const device = useDeviceStore();
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
		return slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.patch?.[key] ?? 0;
	}
</script>

