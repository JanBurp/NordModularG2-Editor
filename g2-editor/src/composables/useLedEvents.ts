import type { SlotLabel } from '@/types';
import { useLedStore } from '@/store/led';
import type { LogFn } from './useG2';

export function useLedEvents(log: LogFn) {
	const ledStore = useLedStore();

	function handleEvent(ev: any): boolean {
		if (ev.type === 'led_data') {
			const sl = ev.slot as SlotLabel;
			if (sl) ledStore.parseLedData(sl, ev.data);
			log('←', 'Watch', `led slot=${ev.slot}`, 'led');
			return true;
		}
		if (ev.type === 'volume_data') {
			const sl = ev.slot as SlotLabel;
			if (sl) ledStore.parseVolumeData(sl, ev.data);
			log('←', 'Watch', `vol slot=${ev.slot}`, 'volume');
			return true;
		}
		return false;
	}

	return { handleEvent };
}
