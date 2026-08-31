<template>
	<Teleport to="body">
		<div v-if="isRoot" class="fixed inset-0 z-40" @click="emit('close')" @contextmenu.prevent="emit('close')" />

		<ul
			ref="menuEl"
			role="menu"
			data-testid="context-menu"
			class="fixed z-50 min-w-40 max-h-[90vh] overflow-y-auto bg-surface-2 border border-line-default rounded shadow-xl py-1 text-sm text-content-primary list-none m-0 p-0"
			:style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
			@mouseenter="cancelClose"
			@mouseleave="scheduleClose(300)"
		>
			<template v-for="(item, idx) in items" :key="idx">
				<li v-if="item.type === 'separator'" class="border-t border-line-default my-1 mx-2" />

				<li v-else-if="item.type === 'swatches'" class="grid grid-cols-4">
					<button
						v-for="(sw, si) in item.swatches"
						:key="si"
						class="h-8 border border-line-default hover:border-2 hover:border-content-primary cursor-pointer"
						:class="sw.fullWidth ? 'col-span-4 w-full' : 'w-10'"
						:style="{ backgroundColor: sw.color }"
						@click.stop="onSwatchClick(sw)"
					/>
				</li>

				<li
					v-else
					role="menuitem"
					:ref="(el) => setItemRef(idx, el as HTMLElement | null)"
					class="flex items-center justify-between px-3 py-1.5 select-none"
					:class="[
						item.disabled ? 'text-content-muted cursor-not-allowed' : 'hover:bg-surface-3 cursor-pointer',
						activeSubmenu === idx ? 'bg-surface-3' : '',
						item.bgColor ? 'text-neutral-900' : '',
					]"
					:style="item.bgColor ? { backgroundColor: item.bgColor } : {}"
					@mouseenter="onItemEnter(idx)"
					@click.stop="onItemClick(item)"
				>
					<span>{{ item.label }}</span>
					<Icon v-if="item.children" name="chevronRight" class="w-2.5 h-2.5 text-content-muted ml-6" />
				</li>
			</template>
		</ul>

		<ContextMenu
			v-if="activeSubmenu !== null && items[activeSubmenu]?.children"
			:items="items[activeSubmenu!].children!"
			:x="submenuPos.x"
			:y="submenuPos.y"
			:is-root="false"
			@close="emit('close')"
		/>
	</Teleport>
</template>
<script setup lang="ts">
	import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
	import { useContextMenu } from '../../composables/useContextMenu';
	import type { ContextMenuItem, ContextMenuSwatch } from '../../types';
	import Icon from './Icon.vue';

	defineOptions({ name: 'ContextMenu' });

	const props = withDefaults(
		defineProps<{
			items: ContextMenuItem[];
			x: number;
			y: number;
			isRoot?: boolean;
		}>(),
		{ isRoot: true },
	);

	const emit = defineEmits<{ close: [] }>();

	const { scheduleClose, cancelClose } = useContextMenu();

	const menuEl = ref<HTMLElement | null>(null);
	const adjustedX = ref(props.x);
	const adjustedY = ref(props.y);
	const activeSubmenu = ref<number | null>(null);
	const submenuPos = ref({ x: 0, y: 0 });
	const itemRefs = new Map<number, HTMLElement>();

	function setItemRef(idx: number, el: HTMLElement | null) {
		if (el) itemRefs.set(idx, el);
		else itemRefs.delete(idx);
	}

	async function clampToViewport() {
		await nextTick();
		if (!menuEl.value) return;
		const { clientWidth: w, clientHeight: h } = menuEl.value;
		adjustedX.value = Math.min(props.x, window.innerWidth - w - 4);
		adjustedY.value = Math.min(props.y, window.innerHeight - h - 4);
	}

	watch(() => [props.x, props.y, props.items], clampToViewport, { immediate: true });

	function onItemEnter(idx: number) {
		cancelClose();
		const item = props.items[idx];
		if (!item.children) {
			activeSubmenu.value = null;
			return;
		}
		activeSubmenu.value = idx;
		const el = itemRefs.get(idx);
		if (el) {
			const rect = el.getBoundingClientRect();
			const submenuWidth = 160;
			const x = rect.right + submenuWidth + 4 > window.innerWidth ? rect.left - submenuWidth : rect.right;
			submenuPos.value = { x, y: rect.top };
		}
	}

	function onItemClick(item: ContextMenuItem) {
		if (item.disabled || item.children) return;
		item.action?.();
		emit('close');
	}

	function onSwatchClick(sw: ContextMenuSwatch) {
		sw.action();
		emit('close');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') emit('close');
	}

	onMounted(() => {
		if (props.isRoot) window.addEventListener('keydown', onKeydown);
	});

	onUnmounted(() => {
		if (props.isRoot) window.removeEventListener('keydown', onKeydown);
	});
</script>
