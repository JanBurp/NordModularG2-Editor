<template>
	<div
		class="relative flex flex-col justify-center w-28 h-10 shrink-0 px-1.5 rounded-xs border text-xs select-none"
		:class="[
			danger
				? 'border-dashed border-red-500/60 text-red-500 items-center'
				: empty
					? 'border-dashed border-line-subtle'
					: 'border-line-default bg-surface-2',
			{ 'opacity-40': dimmed, 'outline-2 outline-input -outline-offset-2': highlighted, 'ring-2 ring-inset ring-input': selected },
		]"
		:style="tint ? { backgroundColor: tint } : undefined"
	>
		<span class="truncate text-content-muted">{{ label }}</span>
		<span class="truncate" :class="danger ? '' : empty ? 'text-content-muted' : 'text-content-primary'">{{ name }}</span>
		<slot />
	</div>
</template>

<script setup lang="ts">
	// One box of the Bank Organizer's top area: a live slot (A-D, Perf), a Temporary Storage place, or the Trash.
	defineProps<{
		label: string;
		name: string;
		empty?: boolean;
		danger?: boolean; // the Trash drop target
		dimmed?: boolean;
		highlighted?: boolean;
		selected?: boolean;
		tint?: string;
	}>();
</script>
