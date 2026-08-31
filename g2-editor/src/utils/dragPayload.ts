// Payloads carried by the app's native HTML5 drags. Everything travels as JSON in 'text/plain'
// (the only type reliably readable during dragover in Chromium), so every drop handler parses the
// same way and then checks `type` to see whether the payload is one it accepts.
// `global` marks a Global Parameter Page knob (ParameterPages.vue, Global Pages toggle on) as
// opposed to the default per-Patch Parameter Page knob — see assignParamToGlobalPage vs.
// assignParamToPage at the drop targets.
export type DragPayload = { type: 'cc'; cc: number } | { type: 'knob-slot'; slotIndex: number; global?: boolean };

export function serializeDragPayload(payload: DragPayload): string {
	return JSON.stringify(payload);
}

// Returns null when the drop carried no payload of ours (foreign drag source, or malformed data).
export function parseDragPayload(event: DragEvent): DragPayload | null {
	const raw = event.dataTransfer?.getData('text/plain');
	if (!raw) return null;
	try {
		const data = JSON.parse(raw);
		return data?.type === 'cc' || data?.type === 'knob-slot' ? data : null;
	} catch {
		return null;
	}
}
