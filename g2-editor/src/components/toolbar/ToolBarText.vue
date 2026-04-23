<template>
	<span class="text-sm border border-black text-black inline-block px-2 py-1 text-center rounded h-8" :class="bgColor">
		<slot></slot>
	</span>
</template>

<script setup lang="ts">
	import { computed, useSlots } from 'vue';

	const slots = useSlots()

	const hasDefaultSlot = computed(() => {
		if (!slots.default) return true // no slot provided -> treat as empty
		const vnodes = slots.default() || []
		// consider empty if every vnode is a text node that's only whitespace
		return vnodes.length === 0 || vnodes.every(vn => {
			// text nodes have type === Symbol(Text) or vnode.children is a string
			const children = vn?.children
			if (typeof children === 'string') return children.trim() === ''
			return false
		})
	});

	const bgColor = computed(() => {
		if (hasDefaultSlot.value) {
			return 'bg-neutral-900';
		}
		return 'bg-neutral-300';
	});

</script>
