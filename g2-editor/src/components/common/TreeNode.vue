<template>
	<div class="select-none" :style="{ paddingLeft: (depth ?? 0) * 4 + 'px' }">
		<div class="flex items-center py-0.5 px-1 cursor-pointer rounded hover:bg-neutral-700" @click="handleToggle">
			<span v-if="isExpandable(node)" class="w-4 text-xs text-neutral-500 flex-shrink-0">{{ expanded.has(node.key) ? '▼' : '▶' }}</span>
			<span v-else class="w-4 flex-shrink-0"></span>
			<span class="text-red-400 mr-1">{{ node.key }}:</span>
			<span
				v-if="!isExpandable(node)"
				class="text-green-500"
				:class="{
					'text-orange-400': getValueType(node.value) === 'number',
					'text-cyan-400': getValueType(node.value) === 'boolean',
				}"
				>{{ node.value }}</span
			>
			<span v-else class="text-neutral-500 italic">{{ node.value }}</span>
		</div>
		<div v-if="isExpandable(node) && expanded.has(node.key) && node.children">
			<TreeNode
				v-for="child in node.children"
				:key="child.key"
				:node="child"
				:depth="(depth ?? 0) + 1"
				:expanded="expanded"
				:get-value-type="getValueType"
				:is-expandable="isExpandable"
				@toggle="$emit('toggle', $event)"
			/>
		</div>
	</div>
</template>
<script setup lang="ts">
	interface TreeNodeData {
		key: string;
		value: unknown;
		children?: TreeNodeData[];
	}

	const props = defineProps<{
		node: TreeNodeData;
		depth?: number;
		expanded: Set<string>;
		getValueType: (value: unknown) => string;
		isExpandable: (node: TreeNodeData) => boolean;
	}>();

	const emit = defineEmits(['toggle']);

	function handleToggle() {
		if (props.isExpandable(props.node)) {
			emit('toggle', props.node.key);
		}
	}
</script>
