<template>
	<span class="status-dot" :class="statusDotClass(status)" />
</template>

<script setup lang="ts">
	import { DeviceStatus, statusDotClass } from '@/store/device';

	defineProps<{
		status: DeviceStatus;
	}>();
</script>
