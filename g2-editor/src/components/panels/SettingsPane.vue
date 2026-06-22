<template>
	<div class="flex flex-col gap-1">
		<Collapsible title="Editor Settings" :default-open="false">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.editorTheme">
					<BtnGroup :model-value="settings.theme" :options="THEME_OPTIONS" @update:model-value="settings.setTheme($event as ThemeMode)" />
				</SettingsRow>

				<p class="settings-subheader">Cable rendering:</p>
				<SettingsRow :label="L.cableGravity">
					<RangeInput :model-value="settings.cableGravity" :min="0" :max="100" :step="1" @update:model-value="settings.setCableGravity($event)" />
				</SettingsRow>
				<SettingsRow :label="L.cableOpacity">
					<RangeInput :model-value="settings.cableOpacity" :min="0" :max="100" :step="1" @update:model-value="settings.setCableOpacity($event)" />
				</SettingsRow>
				<SettingsRow :label="L.cableThickness">
					<RangeInput
						:model-value="settings.cableThickness"
						:min="0"
						:max="6.5"
						:step="0.5"
						@update:model-value="settings.setCableThickness($event)"
					/>
				</SettingsRow>

				<p class="settings-subheader">Settings:</p>
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
		<Collapsible v-if="device.connected" title="Synth Settings" :default-open="false">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.synthName">
					<TextInput :model-value="device.device?.synthName ?? ''" @update:model-value="device.setSynthName($event)" />
				</SettingsRow>

				<SettingsRow label="Memory Protect">
					<CheckBox :model-value="device.device?.memProtect ?? false" @update:model-value="device.setMemProtect($event)" />
				</SettingsRow>

				<p class="settings-subheader">MIDI Channels:</p>
				<SettingsRow v-for="slot in MIDI_SLOTS" :key="slot.key" :label="slot.label">
					<div class="flex items-center gap-2">
						<NumberInput
							:model-value="midiChannelDisplay(slot.key)"
							:min="1"
							:max="16"
							:disabled="isMidiOff(slot.key)"
							class="w-16"
							@update:model-value="device.setMidiSlot(slot.key, $event)"
						/>
						<CheckBox :model-value="isMidiOff(slot.key)" @update:model-value="setMidiOff(slot.key, $event)" />
						<span class="text-xs text-content-secondary">Off</span>
					</div>
				</SettingsRow>

				<p class="settings-subheader">MIDI Settings</p>
				<SettingsRow :label="L.midiLocal">
					<CheckBox :model-value="device.device?.midi.local ?? false" @update:model-value="device.setMidiLocal($event)" />
				</SettingsRow>
				<SettingsRow label="Clock">
					<BtnGroup :model-value="clockValue" :options="OFF_SEND_RECV_BOTH" @update:model-value="setClock(Number($event))" />
				</SettingsRow>
				<SettingsRow :label="L.midiPrgCh">
					<BtnGroup
						:model-value="device.device?.midi.prgch ?? 0"
						:options="OFF_SEND_RECV_BOTH"
						@update:model-value="device.setMidiPrgCh(Number($event))"
					/>
				</SettingsRow>
				<SettingsRow label="CC">
					<BtnGroup :model-value="ccValue" :options="OFF_SEND_RECV_BOTH" @update:model-value="setCC(Number($event))" />
				</SettingsRow>
				<SettingsRow :label="L.midiSysex">
					<div class="flex items-center gap-2">
						<NumberInput
							:model-value="sysex.display()"
							:min="1"
							:max="16"
							:disabled="sysex.isOff()"
							class="w-16"
							@update:model-value="device.setMidiSysex($event)"
						/>
						<CheckBox :model-value="sysex.isOff()" @update:model-value="sysex.setOff($event)" />
						<span class="text-xs text-content-secondary">All</span>
					</div>
				</SettingsRow>

				<SettingsRowDuo label="Tuning" label1="Semi" label2="Cents">
					<template #first>
						<NumberInput
							:model-value="device.device?.tuning.semi ?? 0"
							:min="-6"
							:max="6"
							class="w-16"
							@update:model-value="device.setTuningSemi($event)"
						/>
					</template>
					<template #second>
						<NumberInput
							:model-value="device.device?.tuning.cent ?? 0"
							:min="-100"
							:max="100"
							class="w-16"
							@update:model-value="device.setTuningCent($event)"
						/>
					</template>
				</SettingsRowDuo>
				<SettingsRowDuo label="Pedal" label1="Polarity" label2="Gain">
					<template #first>
						<CheckBox :model-value="device.device?.pedal.polarity ?? false" @update:model-value="device.setPedalPolarity($event)" />
					</template>
					<template #second>
						<NumberInput
							:model-value="device.device?.pedal.gain ?? 0"
							:min="0"
							:max="32"
							class="w-16"
							@update:model-value="device.setPedalGain($event)"
						/>
					</template>
				</SettingsRowDuo>
				<SettingsRow label="Global Oct.">
					<div class="flex items-center gap-2">
						<BtnGroup
							:model-value="device.device?.globalOctaveShift ?? 0"
							:options="[
								{ label: '-2', value: -2 },
								{ label: '-1', value: -1 },
								{ label: '0', value: 0 },
								{ label: '+1', value: 1 },
								{ label: '+2', value: 2 },
							]"
							@update:model-value="device.setGlobalOctaveShift(Number($event))"
						/>
						<CheckBox
							:model-value="device.device?.globalOctaveShiftActive ?? false"
							@update:model-value="device.setGlobalOctaveShiftActive($event)"
						/>
						<span class="text-xs text-content-secondary">Active</span>
					</div>
				</SettingsRow>
			</div>
		</Collapsible>

		<Collapsible v-if="device.device || anyPatchLoaded" title="Performance Settings" :default-open="false">
			<div class="flex flex-col gap-1">
				<SettingsRow :label="L.perfName">
					<TextInput
						:model-value="device.device?.performance?.name ?? ''"
						maxlength="16"
						:debounce="500"
						@update:model-value="device.setPerfName($event)"
						:disabled="!isPerformanceMode"
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
				<div
					class="grid text-xs text-content-muted mb-0.5 px-0.5"
					style="grid-template-columns: 1.25rem 3rem 1fr 1fr 1fr 1.75rem 1.75rem; gap: 0.25rem"
				>
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
					<span class="text-content-secondary font-medium">{{ slot }}</span>
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
					<div class="settings-subheader flex items-center">
						<span class="w-20">{{ group.header }}</span>
						<CheckBox
							class="ml-px"
							v-if="group.toggleKey"
							:model-value="!!patchParam(group.toggleKey)"
							@update:model-value="slotsStore.setPatchParam(uiStore.variation, group.toggleKey!, $event ? 1 : 0)"
						/>
					</div>
					<SettingsRow v-for="param in group.params" :key="param.key" :label="param.label">
						<BtnGroup
							v-if="param.btnOptions"
							:model-value="patchParam(param.key)"
							:options="param.btnOptions"
							@update:model-value="slotsStore.setPatchParam(uiStore.variation, param.key, Number($event))"
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
	import { computed } from 'vue';
	import { makeOffMemory, OFF_SENTINEL } from '@/composables/useOffMemory';
	import Collapsible from '@/components/common/Collapsible.vue';
	import RangeInput from '@/components/common/RangeInput.vue';
	import SettingsRow from '@/components/common/SettingsRow.vue';
	import SettingsRowDuo from '@/components/common/SettingsRowDuo.vue';
	import TextInput from '@/components/common/TextInput.vue';
	import NumberInput from '@/components/common/NumberInput.vue';
	import CheckBox from '@/components/common/CheckBox.vue';
	import Select from '@/components/common/Select.vue';
	import BtnGroup from '@/components/toolbar/BtnGroup.vue';
	import { useDeviceStore } from '@/store/device';
	import { useSettingsStore, type ThemeMode } from '@/store/settings';
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
	const anyPatchLoaded = computed(() => SLOT_LABELS.some((slot) => !!slotsStore.getPatchForSlot(slot as SlotLabel)));

	const selectedCategory = computed({
		get: () => (currentPatch.value as any)?.description?.category ?? 0,
		set: (cat: number) => {
			const desc = (currentPatch.value as any)?.description;
			if (desc) {
				desc.category = cat;
				slotsStore.setPatchDescription();
			}
		},
	});

	const MIDI_SLOTS: { key: 'A' | 'B' | 'C' | 'D' | 'global'; label: string }[] = [
		{ key: 'A', label: L.midiSlotA },
		{ key: 'B', label: L.midiSlotB },
		{ key: 'C', label: L.midiSlotC },
		{ key: 'D', label: L.midiSlotD },
		{ key: 'global', label: L.midiGlobal },
	];

	type BtnOpt = { label: string; value: number };
	const PATCH_PARAM_GROUPS: {
		header: string;
		toggleKey?: keyof PatchParamVariation;
		params: { key: keyof PatchParamVariation; label: string; btnOptions?: BtnOpt[] }[];
	}[] = [
		{
			header: 'Arpeggiator',
			toggleKey: 'arpeggiator',
			params: [
				{
					key: 'arpTime',
					label: 'Time',
					btnOptions: [
						{ label: '1/8', value: 0 },
						{ label: '1/8T', value: 1 },
						{ label: '1/16', value: 2 },
						{ label: '1/16T', value: 3 },
					],
				},
				{
					key: 'arpType',
					label: 'Mode',
					btnOptions: [
						{ label: 'Up', value: 0 },
						{ label: 'Dn', value: 1 },
						{ label: 'Up/Dn', value: 2 },
						{ label: 'Rnd', value: 3 },
					],
				},
				{
					key: 'octaves',
					label: 'Octaves',
					btnOptions: [
						{ label: '1', value: 0 },
						{ label: '2', value: 1 },
						{ label: '3', value: 2 },
						{ label: '4', value: 3 },
					],
				},
			],
		},
		{
			header: 'Vibrato',
			params: [
				{
					key: 'vibrato',
					label: 'Source',
					btnOptions: [
						{ label: 'Off', value: 0 },
						{ label: 'AfTch', value: 1 },
						{ label: 'Wheel', value: 2 },
					],
				},
				{ key: 'cents', label: 'Rate' },
			],
		},
		{
			header: 'Glide',
			params: [
				{
					key: 'glide',
					label: 'Type',
					btnOptions: [
						{ label: 'Off', value: 0 },
						{ label: 'Normal', value: 1 },
						{ label: 'Auto', value: 2 },
					],
				},
				{ key: 'glideTime', label: 'Time' },
			],
		},
		{ header: 'Bend', toggleKey: 'bend', params: [{ key: 'semi', label: 'Semitones' }] },
		{
			header: 'Octave Shift',
			params: [
				{
					key: 'octaveShift',
					label: 'Shift',
					btnOptions: [
						{ label: '-2', value: 0 },
						{ label: '-1', value: 1 },
						{ label: '0', value: 2 },
						{ label: '+1', value: 3 },
						{ label: '+2', value: 4 },
					],
				},
			],
		},
	];

	const THEME_OPTIONS = [
		{ label: 'System', value: 'system' },
		{ label: 'Light', value: 'light' },
		{ label: 'Dark', value: 'dark' },
	];

	const OFF_SEND_RECV_BOTH = [
		{ label: 'Off', value: 0 },
		{ label: 'Send', value: 1 },
		{ label: 'Recv', value: 2 },
		{ label: 'Both', value: 3 },
	];

	type MidiKey = 'A' | 'B' | 'C' | 'D' | 'global';
	const midiSlots = Object.fromEntries(
		MIDI_SLOTS.map(({ key }) => [
			key,
			makeOffMemory(
				() => device.device?.midi.slots[key] ?? 1,
				(v) => device.setMidiSlot(key, v),
			),
		]),
	) as Record<MidiKey, ReturnType<typeof makeOffMemory>>;

	function isMidiOff(key: MidiKey) {
		return midiSlots[key].isOff();
	}
	function midiChannelDisplay(key: MidiKey) {
		return midiSlots[key].display();
	}
	function setMidiOff(key: MidiKey, off: boolean) {
		midiSlots[key].setOff(off);
	}

	const sysex = makeOffMemory(
		() => device.device?.midi.sysex ?? 1,
		(v) => device.setMidiSysex(v),
	);

	const clockValue = computed(() => (device.device?.midi.clkse ? 1 : 0) + (device.device?.midi.clkre ? 2 : 0));
	function setClock(value: number) {
		device.setMidiClkSend(!!(value & 1));
		device.setMidiClkReceive(!!(value & 2));
	}

	const ccValue = computed(() => (device.device?.midi.ctrlsSend ? 1 : 0) + (device.device?.midi.ctrlsRecv ? 2 : 0));
	function setCC(value: number) {
		device.setMidiCtrlsSend(!!(value & 1));
		device.setMidiCtrlsRecv(!!(value & 2));
	}

	function slotEntry(slot: SlotLabel) {
		return device.device?.slots.find((s) => s.slot === slot);
	}

	function patchParam(key: keyof PatchParamVariation): number {
		const val = slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.patch?.[key];
		return typeof val === 'number' ? val : 0;
	}
</script>
