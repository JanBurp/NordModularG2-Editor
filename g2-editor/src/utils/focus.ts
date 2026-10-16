// Hover-to-target (settings.hoverKeyTarget): hands the arrow keys back to the canvas by blurring a
// focused control, e.g. the settings checkbox that was just clicked. Text fields keep their focus so
// typing isn't interrupted by moving the mouse.
export function blurFocusedControl() {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement) || el === document.body) return;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return;
	el.blur();
}
