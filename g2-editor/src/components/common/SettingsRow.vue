<template>
	<div class="settings-row">
		<span>{{ label }}</span>
		<slot />
	</div>
</template>

<script setup lang="ts">
	defineProps<{ label: string }>();
</script>
