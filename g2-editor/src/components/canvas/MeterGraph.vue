<template>
	<div
		ref="rootRef"
		class="flex flex-col shrink-0 bg-surface-1 text-xs text-content-primary"
		:style="{ height: settingsStore.meterGraphHeight + 'px' }"
		data-testid="meter-graph"
	>
		<div class="divider-handle" @mousedown="startResize" />
		<div class="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-line-subtle shrink-0">
			<span class="text-content-muted mr-1">Meter Graph</span>
			<span v-if="store.traces.length === 0" class="text-content-muted italic">Right-click a level meter → Show in Meter Graph</span>
			<span
				v-for="t in store.traces"
				:key="t.id"
				class="flex items-center gap-1 px-1.5 rounded-xs border border-line-default cursor-pointer select-none"
				:class="{ 'opacity-40': t.hidden }"
				:title="t.hidden ? 'Show in graph' : 'Hide from graph'"
				data-testid="meter-graph-trace"
				@click="store.toggleHidden(t)"
			>
				<span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: t.color }" />
				<span>{{ store.label(t) }}</span>
				<span class="text-content-muted tabular-nums">pk {{ stats[t.id]?.peak == null ? '–' : `${formatDb(stats[t.id].peak!)} dB` }}</span>
				<span v-if="stats[t.id]?.clip" class="text-red-500 font-bold">CLIP</span>
				<button class="text-content-muted hover:text-content-primary" title="Remove" @click.stop="store.remove(t)">×</button>
			</span>
			<div class="flex-1" />
			<BtnGroup
				:model-value="store.windowSec"
				:options="windowOptions"
				variant="toggle"
				size="small"
				@update:model-value="(v) => (store.windowSec = v as WindowSec)"
			/>
			<Button variant="toggle" size="small" :active="store.paused" @click="store.paused = !store.paused">Pause</Button>
			<Button variant="default" size="small" @click="onClear">Clear</Button>
			<Button variant="default" size="small" @click="settingsStore.showMeterGraph = false">×</Button>
		</div>
		<div ref="bodyRef" class="flex-1 min-h-0 relative">
			<canvas ref="canvasRef" class="absolute inset-0" />
		</div>
	</div>
</template>

<script setup lang="ts">
	// Level of the picked meters over time (store/meterGraph.ts), "now" at the right edge.
	// Y = dB re full scale by the G2's measured meter law (vuLevelDb), with dB scales left and right.
	import { ref, watch, onMounted, onUnmounted } from 'vue';
	import Button from '../toolbar/Button.vue';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import { useMeterGraphStore, WINDOW_OPTIONS, BUFFER_CAPACITY, type SampleBuffer, type WindowSec } from '../../store/meterGraph';
	import { useSettingsStore } from '../../store/settings';
	import { VU_ZONES, VU_DB_FLOOR, vuLevelDb, vuClipped } from '../../utils/vuLevel';

	const store = useMeterGraphStore();
	const settingsStore = useSettingsStore();

	const rootRef = ref<HTMLElement | null>(null);
	const bodyRef = ref<HTMLElement | null>(null);
	const canvasRef = ref<HTMLCanvasElement | null>(null);

	const windowOptions = WINDOW_OPTIONS.map((s) => ({ label: s < 60 ? `${s}s` : `${s / 60}m`, value: s }));
	const GAP_MS = 500; // longer between two samples = no data, line breaks
	const STATS_INTERVAL_MS = 250;
	const TRACE_ALPHA = 0.75;
	const DB_TOP = 18; // headroom above the +12 dB (clip) step
	const AXIS_W = 30; // px for the dB labels, each side
	// The meter's own colours: steps up to −6 dB green, 0 and +6 dB yellow, +12 dB red
	const BANDS = [
		{ from: VU_DB_FLOOR, to: 0, color: VU_ZONES[0].dim },
		{ from: 0, to: 12, color: VU_ZONES[1].dim },
		{ from: 12, to: DB_TOP, color: VU_ZONES[2].dim },
	];

	// Per trace, over the visible window: highest level (dB, null = no samples), and whether it clipped
	const stats = ref<Record<string, { peak: number | null; clip: boolean }>>({});

	const formatDb = (db: number) => (db <= VU_DB_FLOOR ? '<−42' : db > 0 ? `+${db}` : String(db).replace('-', '−'));

	let frozenAt = 0; // "now" while paused
	let dirty = true;
	let raf = 0;
	let lastStats = 0;
	let resizeObserver: ResizeObserver | null = null;

	watch(
		() => store.paused,
		(p) => {
			frozenAt = performance.now();
			if (!p) dirty = true;
		},
	);
	watch([() => store.traces, () => store.windowSec], () => (dirty = true));

	function onClear() {
		store.clear();
		dirty = true;
	}

	// Samples of one buffer inside [from, ∞), oldest first
	function* samples(b: SampleBuffer, from: number) {
		for (let i = 0; i < b.count; i++) {
			const idx = (b.head - b.count + i + BUFFER_CAPACITY) % BUFFER_CAPACITY;
			if (b.t[idx] >= from) yield { t: b.t[idx], db: vuLevelDb(b.v[idx]), clip: vuClipped(b.v[idx]) };
		}
	}

	function draw(now: number) {
		const canvas = canvasRef.value;
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.width / dpr;
		const h = canvas.height / dpr;
		const left = AXIS_W;
		const right = w - AXIS_W;
		const plotW = right - left;
		const windowMs = store.windowSec * 1000;
		const from = now - windowMs;
		const x = (t: number) => right - (plotW * (now - t)) / windowMs;
		const y = (db: number) => h - 1 - ((db - VU_DB_FLOOR) / (DB_TOP - VU_DB_FLOOR)) * (h - 6); // top 5px: clip ticks

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#111';
		ctx.fillRect(0, 0, w, h);
		ctx.globalAlpha = 0.6;
		for (const b of BANDS) {
			ctx.fillStyle = b.color;
			ctx.fillRect(left, y(b.to), plotW, y(b.from) - y(b.to));
		}
		ctx.globalAlpha = 1;

		ctx.strokeStyle = 'rgba(255,255,255,0.08)';
		ctx.fillStyle = '#888';
		ctx.font = '10px sans-serif';
		ctx.lineWidth = 1;

		// dB grid, one line per meter step (6 dB), or every other one when the graph is low
		const dbStep = (h - 6) / ((DB_TOP - VU_DB_FLOOR) / 6) < 14 ? 12 : 6;
		ctx.textBaseline = 'middle';
		for (let db = 12; db > VU_DB_FLOOR; db -= dbStep) {
			const gy = Math.round(y(db)) + 0.5;
			ctx.beginPath();
			ctx.moveTo(left, gy);
			ctx.lineTo(right, gy);
			ctx.stroke();
			ctx.textAlign = 'right';
			ctx.fillText(formatDb(db), left - 4, gy);
			ctx.textAlign = 'left';
			ctx.fillText(formatDb(db), right + 4, gy);
		}
		ctx.textBaseline = 'top';
		ctx.textAlign = 'right';
		ctx.fillText('dB', left - 4, 1);
		ctx.textAlign = 'left';
		ctx.fillText('dB', right + 4, 1);
		ctx.textBaseline = 'alphabetic';

		// Time grid: 10 lines per window, labelled in seconds before now
		const step = windowMs / 10;
		for (let i = 1; i < 10; i++) {
			const gx = Math.round(x(now - i * step)) + 0.5;
			ctx.beginPath();
			ctx.moveTo(gx, 0);
			ctx.lineTo(gx, h);
			ctx.stroke();
			ctx.fillText(`-${(i * step) / 1000}s`, gx + 2, h - 3);
		}

		const newStats: Record<string, { peak: number | null; clip: boolean }> = {};
		for (const tr of store.traces) {
			const b = store.buffers.get(tr.id);
			if (!b) continue;
			let peak: number | null = null;
			let clip = false;
			let prevT = -Infinity;
			let px = 0;
			let py = 0;
			// See-through, so a line doesn't cover the ones behind it. A hidden trace is drawn fully
			// transparent: nothing shows, but its chip keeps its peak and CLIP readout.
			const alpha = tr.hidden ? 0 : TRACE_ALPHA;
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = tr.color;
			ctx.fillStyle = tr.color;
			ctx.lineWidth = 1.5;
			ctx.lineJoin = 'round';
			ctx.beginPath();
			// Smoothed: each sample is the control point of a curve between the midpoints around it,
			// so the line rounds the 6 dB steps without overshooting any measured level.
			for (const s of samples(b, from)) {
				const sx = x(s.t);
				const sy = y(s.db);
				if (s.t - prevT > GAP_MS) {
					if (prevT > -Infinity) ctx.lineTo(px, py); // end the previous run at its last sample
					ctx.moveTo(sx, sy);
				} else ctx.quadraticCurveTo(px, py, (px + sx) / 2, (py + sy) / 2);
				[px, py] = [sx, sy];
				prevT = s.t;
				if (peak === null || s.db > peak) peak = s.db;
				if (s.clip) {
					clip = true;
					ctx.fillRect(sx - 1, 0, 2, 4);
				}
			}
			if (prevT > -Infinity) ctx.lineTo(px, py);
			ctx.stroke();
			if (peak !== null && peak > VU_DB_FLOOR) {
				ctx.globalAlpha = alpha * 0.4;
				ctx.setLineDash([2, 4]);
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(left, y(peak));
				ctx.lineTo(right, y(peak));
				ctx.stroke();
				ctx.setLineDash([]);
			}
			ctx.globalAlpha = 1;
			newStats[tr.id] = { peak, clip };
		}
		if (now - lastStats > STATS_INTERVAL_MS || dirty) {
			stats.value = newStats;
			lastStats = now;
		}
	}

	function loop() {
		raf = requestAnimationFrame(loop);
		if (store.paused && !dirty) return;
		draw(store.paused ? frozenAt : performance.now());
		dirty = false;
	}

	function resizeCanvas() {
		const canvas = canvasRef.value;
		const body = bodyRef.value;
		if (!canvas || !body) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(body.clientWidth * dpr);
		canvas.height = Math.round(body.clientHeight * dpr);
		canvas.style.width = `${body.clientWidth}px`;
		canvas.style.height = `${body.clientHeight}px`;
		dirty = true;
	}

	// Drag the top edge: up = taller. Kept between 80px and 60% of the canvas column.
	function startResize(event: MouseEvent) {
		event.preventDefault();
		const startY = event.clientY;
		const startH = settingsStore.meterGraphHeight;
		const max = (rootRef.value?.parentElement?.clientHeight ?? 600) * 0.6;
		function onMove(e: MouseEvent) {
			settingsStore.meterGraphHeight = Math.round(Math.max(80, Math.min(max, startH + startY - e.clientY)));
		}
		function onUp() {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	onMounted(() => {
		resizeObserver = new ResizeObserver(resizeCanvas);
		if (bodyRef.value) resizeObserver.observe(bodyRef.value);
		frozenAt = performance.now();
		loop();
	});

	onUnmounted(() => {
		cancelAnimationFrame(raf);
		resizeObserver?.disconnect();
	});
</script>
