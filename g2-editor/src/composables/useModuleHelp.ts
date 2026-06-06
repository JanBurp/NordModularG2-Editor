import { ref } from 'vue';

export function useModuleHelp() {
	const helpHtml = ref('');

	async function loadHelp(shortName: string) {
		const raw = await window.electronAPI.loadHelp(shortName);
		if (!raw) {
			helpHtml.value = '';
			return;
		}
		const { marked } = await import('marked');
		helpHtml.value = (await marked(raw)) as string;
	}

	function clearHelp() {
		helpHtml.value = '';
	}

	return { helpHtml, loadHelp, clearHelp };
}
