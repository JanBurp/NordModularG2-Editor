<template>
	<Teleport to="body">
		<div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="close">
			<div class="bg-surface-2 border border-line-default rounded shadow-xl w-88 mx-4">
				<div class="flex items-center justify-between px-4 py-3 border-b border-line-default">
					<span class="text-sm font-semibold text-content-primary">About {{ APP_NAME }}</span>
					<button v-if="closable" class="hover:text-content-primary cursor-pointer" @click="close">
						<Icon name="close" class="w-3 h-3" />
					</button>
				</div>
				<div class="px-4 py-4 flex flex-col items-center gap-3 text-center">
					<img v-if="iconDataUrl" :src="iconDataUrl" class="w-16 h-16" alt="G2 Editor icon" />
					<div>
						<div class="text-base font-bold text-content-primary">{{ APP_NAME }}</div>
						<div class="text-xs mt-0.5">v{{ version }}</div>
					</div>
					<div class="text-xs">Editor for the Nord Modular G2 - by Jan den Besten</div>
					<button class="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer bg-transparent border-0 p-0" @click="openSite">
						janburp.github.io/NordModularG2-Editor
					</button>

					<div class="w-full border-t border-line-default pt-3 flex flex-col gap-2 text-left">
						<p class="text-xs italic text-center">Use this editor at your own risk.</p>
						<p class="text-xs text-center">
							Thanks to the Nord G2 community at
							<button
								class="text-blue-500 hover:text-blue-400 underline bg-transparent border-0 p-0 cursor-pointer text-xs"
								@click="openLink('https://electro-music.com')"
							>
								electro-music.com</button
							>, bverhue for the
							<button
								class="text-blue-500 hover:text-blue-400 underline bg-transparent border-0 p-0 cursor-pointer text-xs"
								@click="openLink('https://www.bverhue.nl/g2dev/')"
							>
								Delphi Editor
							</button>
							, ian-s for the
							<button
								class="text-blue-500 hover:text-blue-400 underline bg-transparent border-0 p-0 cursor-pointer text-xs"
								@click="openLink('https://electro-music.com/patchviewer/')"
							>
								patchviewer
							</button>
							, Chris Purusha for sharing tech info and his
							<button
								class="text-blue-500 hover:text-blue-400 underline bg-transparent border-0 p-0 cursor-pointer text-xs"
								@click="openLink('https://github.com/chrispurusha/G2-Edit')"
							>
								editor
							</button>
							, Åka Danielson for mini-module graphics, BlueHell for lending an Engine, and all others who tested or donated to make this work
							possible.
						</p>
						<div class="flex justify-center pt-1">
							<button
								class="text-xs text-yellow-500 hover:text-yellow-400 cursor-pointer bg-transparent border-0 p-0"
								@click="openLink('https://www.paypal.com/donate/?hosted_button_id=UZE943PYKY5S6')"
							>
								♥ Donate
							</button>
						</div>
					</div>
				</div>
				<div
					v-if="connecting || closable"
					class="flex flex-col px-4 py-3 border-t border-line-default gap-2"
					:class="connecting ? 'items-center' : 'items-end'"
				>
					<template v-if="connecting">
						<div class="flex items-center gap-2">
							<div class="animate-spin w-4 h-4 border-2 border-line-default border-t-content-primary rounded-full" />
							<span class="text-xs">{{ connectingMessage || 'Connecting...' }}</span>
						</div>
					</template>
					<template v-else>
						<p v-if="message" class="text-xs text-red-500 self-center text-center">{{ message }}</p>
						<Button variant="default" @click="close">Close</Button>
					</template>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { ref, watch, onMounted, onUnmounted } from 'vue';
	import Button from '@/components/toolbar/Button.vue';
	import Icon from '@/components/common/Icon.vue';
	import { APP_NAME } from '@/constants';

	const props = withDefaults(defineProps<{ modelValue: boolean; closable?: boolean; connecting?: boolean; connectingMessage?: string; message?: string }>(), {
		closable: true,
		connecting: false,
	});
	const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

	const version = ref('');
	const iconDataUrl = ref('');

	watch(
		() => props.modelValue,
		async (open) => {
			if (open && !version.value) {
				const info = await window.electronAPI.getAppInfo();
				version.value = info.version;
				iconDataUrl.value = info.iconDataUrl;
			}
		},
		{ immediate: true },
	);

	function close() {
		if (!props.closable) return;
		emit('update:modelValue', false);
	}

	function openSite() {
		window.electronAPI.openExternal('https://janburp.github.io/NordModularG2-Editor/');
	}

	function openLink(url: string) {
		window.electronAPI.openExternal(url);
	}

	function onKeydown(e: KeyboardEvent) {
		if (props.modelValue && e.key === 'Escape') close();
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
