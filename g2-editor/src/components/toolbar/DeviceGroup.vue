<template>
	<div
		class="flex items-center gap-2"
		:class="{ 'opacity-60 hover:opacity-100': !active }"
		data-testid="device-group"
		:data-active="active"
		@contextmenu="emit('contextmenu', $event)"
	>
		<BtnGroup
			:model-value="selectedSlot"
			:options="SLOT_OPTIONS"
			:top-indicators="slotsKeyed"
			:bottom-indicators="slotsActive"
			:testIdPrefix="active ? 'slot' : undefined"
			@update:model-value="(v) => emit('slot', v as number, 'none')"
			@toggle-off="(v) => !active && emit('slot', v as number, 'none')"
			@shift-click="(v) => emit('slot', v as number, 'shift')"
			@ctrl-click="(v) => emit('slot', v as number, 'ctrl')"
		/>
		<ToolBarDivider />
		<ToolBarText class="w-32 cursor-pointer" :class="{ 'font-bold': active }" data-testid="device-name" hint="deviceSelect" @click="emit('select')">
			<!-- inner flex: ToolBarText is inline-block, in which the dot would have no size -->
			<span class="flex items-center justify-center gap-1.5">
				<ConnectionDot v-if="status" :status="status" />
				<span class="truncate">{{ name || '---' }}</span>
			</span>
		</ToolBarText>
		<Button variant="toggle" :active="perfMode" hint="perfMode" @click="(e: MouseEvent) => emit('perf', e.shiftKey)">Perf</Button>
	</div>
</template>

<script setup lang="ts">
	import Button from './Button.vue';
	import BtnGroup from './BtnGroup.vue';
	import ToolBarText from './ToolBarText.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import ConnectionDot from '@/components/common/ConnectionDot.vue';
	import { SLOT_OPTIONS } from '@/constants';
	import type { DeviceStatus } from '@/store/device';

	// One device's [A B C D] [● Name] [Perf] in the toolbar. `active` is the device this view shows.
	defineProps<{
		active: boolean;
		name: string | null;
		// null: no connection dot (offline mode)
		status: DeviceStatus | null;
		perfMode: boolean;
		selectedSlot: number | null;
		slotsActive: boolean[];
		slotsKeyed: boolean[];
	}>();

	const emit = defineEmits<{
		select: [];
		slot: [slot: number, mod: 'none' | 'shift' | 'ctrl'];
		perf: [shift: boolean];
		contextmenu: [event: MouseEvent];
	}>();
</script>
