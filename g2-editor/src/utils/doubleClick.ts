// Own double-click detection: in the Electron window MouseEvent.detail stays 1 and native dblclick often doesn't fire.
// Call the returned function on every click/mousedown; it's true for the second one within `ms` on the same `key`.
export function createDoubleClickDetector(ms = 400): (key?: string) => boolean {
	let last = { key: '', t: 0 };
	return (key = '') => {
		const now = performance.now();
		const isDouble = key === last.key && now - last.t < ms;
		last = isDouble ? { key: '', t: 0 } : { key, t: now };
		return isDouble;
	};
}

// Only a primary-button mousedown counts towards a double-click: a right-click opens the context menu, and a
// touch fires both touchstart and a synthetic mousedown (which then counts once).
export function isPrimaryMouseDown(e: MouseEvent | TouchEvent): boolean {
	return 'button' in e && e.button === 0;
}
