<script setup lang="ts">
	import { ref, watch, nextTick, computed } from 'vue';
	import BtnGroup from '@/components/toolbar/BtnGroup.vue';
	import Button from '@/components/toolbar/Button.vue';
	import type { UsbLogEntry, DeviceStatus } from '@/composables/useG2';

	interface Props {
		logs: UsbLogEntry[];
		deviceStatus: DeviceStatus;
	}

	const props = defineProps<Props>();

	const emit = defineEmits<{
		disconnect: [];
		connect: [];
		'clear-logs': [];
	}>();

	const logContainer = ref<HTMLElement | null>(null);

	const visibleCategories = ref<string[]>(['param', 'led', 'volume', 'unknown']);

	const filteredLogs = computed(() => props.logs.filter((e) => visibleCategories.value.includes(e.category ?? '')));

	watch(
		() => props.logs.length,
		async () => {
			await nextTick();
			if (logContainer.value) {
				logContainer.value.scrollTop = logContainer.value.scrollHeight;
			}
		},
	);

	const statusClass = computed(() => {
		switch (props.deviceStatus) {
			case 'connected':
				return 'border-l-green-500';
			case 'connecting':
			case 'uploading':
			case 'downloading':
				return 'border-l-orange-500';
			case 'error':
			case 'unsupported':
				return 'border-l-red-500';
			default:
				return 'border-l-neutral-600';
		}
	});

	const statusLabel = computed(() => {
		switch (props.deviceStatus) {
			case 'connected':
				return 'Connected';
			case 'connecting':
				return 'Connecting...';
			case 'disconnected':
				return 'Disconnected';
			case 'uploading':
				return 'Uploading...';
			case 'downloading':
				return 'Downloading...';
			case 'error':
				return 'Error';
			case 'unsupported':
				return 'Not Available';
			default:
				return 'Unknown';
		}
	});

	function handleDisconnect() {
		emit('disconnect');
	}

	function handleConnect() {
		emit('connect');
	}

	function handleClearLogs() {
		emit('clear-logs');
	}
</script>

<template>
	<div class="flex flex-col h-full p-2 gap-2">
		<div class="flex items-center gap-2 p-3 rounded bg-neutral-900 border-l-4" :class="statusClass">
			<span class="text-base">🔌</span>
			<span class="text-sm font-medium text-neutral-200">{{ statusLabel }}</span>
			<Button variant="default"
				v-if="deviceStatus === 'connected'"
				class="ml-auto px-3 py-1 text-xs bg-neutral-700 text-neutral-200 border border-neutral-600 rounded cursor-pointer hover:bg-neutral-600 transition-colors"
				@click="handleDisconnect"
			>
				Disconnect
			</Button variant="default">
			<Button variant="default"
				v-else-if="deviceStatus !== 'connecting'"
				class="ml-auto px-3 py-1 text-xs bg-neutral-700 text-neutral-200 border border-neutral-600 rounded cursor-pointer hover:bg-neutral-600 transition-colors"
				@click="handleConnect"
			>
				Connect
			</Button variant="default">
		</div>

		<div class="flex justify-between items-center px-1 gap-2">
			<BtnGroup
				v-model="visibleCategories"
				:options="[
					{ label: 'par', value: 'param' },
					{ label: 'led', value: 'led' },
					{ label: 'vol', value: 'volume' },
					{ label: 'unk', value: 'unknown' },
					{ label: 'raw', value: 'raw' },
				]"
				size="small"
				multi-select
			/>
			<Button variant="default" size="small" @click="handleClearLogs">clr</Button>
		</div>

		<div ref="logContainer" class="flex-1 overflow-y-auto bg-neutral-950 rounded p-2 font-mono text-xs">
			<div v-for="entry in filteredLogs" :key="entry.id" class="py-1 border-b border-neutral-900 last:border-b-0">
				<div class="flex gap-1.5 mb-0.5">
					<span class="text-neutral-600 flex-shrink-0">{{ entry.timestamp }}</span>
					<span class="text-neutral-500 flex-shrink-0 w-5 text-center">{{ entry.direction }}</span>
					<span class="text-cyan-400 flex-shrink-0 font-medium">{{ entry.event }}</span>
				</div>
				<div class="text-neutral-300 break-words pl-12">
					{{ entry.message }}
				</div>
			</div>
		</div>
	</div>
</template>
