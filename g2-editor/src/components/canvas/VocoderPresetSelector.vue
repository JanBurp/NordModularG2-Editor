<template>
	<g class="vocoder-preset" data-testid="vocoder-preset">
		<g v-for="(btn, index) in BUTTONS" :key="btn" class="vocoder-preset-button" data-testid="vocoder-preset-button" @click="onClick(btn)">
			<rect :x="x0 + index * buttonW" :y="y0" :width="buttonW" :height="h" fill="#CCC" stroke="#333" />
			<text :x="x0 + index * buttonW + buttonW / 2" :y="y0 + h - 3" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
				{{ btn }}
			</text>
		</g>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { vocoderPreset0 } from '../../renderer/nmg2mods';

	const props = defineProps<{
		ve: VisualElement;
	}>();

	const emit = defineEmits<{
		apply: [values: number[]];
	}>();

	const BUTTONS = ['-2', '-1', '0', '+1', '+2', 'Inv', 'Rnd'] as const;

	const x0 = computed(() => props.ve.x ?? 0);
	const y0 = computed(() => props.ve.y ?? 0);
	const h = computed(() => props.ve.h ?? 0);
	const buttonW = computed(() => (props.ve.w ?? 0) / BUTTONS.length);

	// Port of CPnlVocoderPreset::GetRequestedChange: one click recomputes all 16 Band values in a
	// single atomic batch (each analysis band's routed synthesis band, 0=Off, 1..16=target band).
	// Counterintuitively, the button labeled "-N" shifts every value *up* by N and "+N" shifts
	// *down* by N (verified twice against the decompiled source, not a decoding artifact) — the
	// label describes the shift from the synthesis-band side, not the stored value's own sign.
	function computeValue(label: (typeof BUTTONS)[number], bandIndex: number): number {
		switch (label) {
			case '0':
				return vocoderPreset0(bandIndex);
			case 'Inv':
				return 16 - bandIndex;
			case 'Rnd':
				return Math.floor(Math.random() * 17);
			case '-2': {
				const v = bandIndex + 3;
				return v > 16 ? 0 : v;
			}
			case '-1': {
				const v = bandIndex + 2;
				return v > 16 ? 0 : v;
			}
			case '+1':
				return bandIndex;
			case '+2':
				return Math.max(bandIndex - 1, 0);
		}
	}

	function onClick(label: (typeof BUTTONS)[number]) {
		emit(
			'apply',
			Array.from({ length: 16 }, (_, i) => computeValue(label, i)),
		);
	}
</script>
<style scoped>
	.vocoder-preset-button {
		cursor: pointer;
	}
	.vocoder-preset-button:hover rect {
		stroke: #666;
	}
</style>
