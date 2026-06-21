<template>
	<div class="settings-row">
		<span>{{ label }}</span>
		<div class="grid grid-cols-2 flex-1 gap-2">
			<div class="flex items-center gap-1">
				<span class="text-xs text-content-secondary">{{ label1 }}</span>
				<slot name="first" />
			</div>
			<div class="flex items-center gap-1">
				<span class="text-xs text-content-secondary">{{ label2 }}</span>
				<slot name="second" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	defineProps<{ label: string; label1: string; label2: string }>();
</script>
