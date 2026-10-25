<template>
	<div
		class="relative flex flex-col justify-center w-28 h-10 shrink-0 px-1.5 rounded-xs border text-xs select-none"
		:class="[
			danger
				? 'border-dashed border-red-500/60 text-red-500 items-center'
				: empty
					? 'border-dashed border-line-subtle'
					: focused
						? 'border-input bg-input-dimmed'
						: 'border-line-default bg-surface-cell',
			{
				'opacity-40 cursor-not-allowed': dimmed,
				'organizer-hover': !empty && !danger && !dimmed,
				'cursor-grab active:cursor-grabbing': $attrs.draggable === true || $attrs.draggable === 'true',
				'outline-2 outline-input -outline-offset-2': highlighted,
				'ring-2 ring-inset ring-input': selected,
				'outline-1 outline-dashed outline-input -outline-offset-2': cursor && !highlighted,
			},
		]"
		:style="tint ? { backgroundColor: tint } : undefined"
		:title="empty || danger ? undefined : name"
	>
		<span class="truncate" :class="empty || danger ? 'text-content-muted' : 'text-content-primary/60'">{{ label }}</span>
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
		focused?: boolean; // the slot in focus
		highlighted?: boolean;
		selected?: boolean;
		cursor?: boolean; // arrow-key position
		tint?: string;
	}>();
</script>
