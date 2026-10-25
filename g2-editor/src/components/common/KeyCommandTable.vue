<template>
	<div>
		<h3 class="text-content-secondary uppercase text-xs font-semibold tracking-wide mb-2">{{ title }}</h3>
		<table class="w-full">
			<tbody>
				<tr v-for="row in rows" :key="row.action" class="border-t border-line-default/40">
					<td class="py-1 pr-3 font-mono text-xs whitespace-nowrap">
						<span v-for="(k, i) in row.keys" :key="i">
							<kbd class="px-1.5 py-0.5 bg-surface-2 border border-line-default rounded text-xs font-mono">{{ k }}</kbd>
							<span v-if="i < row.keys.length - 1" class="text-content-secondary mx-0.5">/</span>
						</span>
					</td>
					<td class="py-1 text-content-secondary">{{ row.action }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup lang="ts">
	export type KeyCommandGroup = { title: string; rows: { keys: string[]; action: string }[] };

	defineProps<KeyCommandGroup>();
</script>
