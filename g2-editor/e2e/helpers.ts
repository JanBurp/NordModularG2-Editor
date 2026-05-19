import type { Page } from '@playwright/test';

/**
 * Drop a module from the ModulesPane onto the voice canvas by dispatching
 * DragEvent with DataTransfer directly. The moduleId must match nmg2mods id.
 */
export async function dropModuleOnCanvas(
	page: Page,
	moduleId: number,
	col = 0,
	row = 0,
	area: 'va' | 'fx' = 'va',
): Promise<void> {
	const canvas = await page.locator(`[data-testid="canvas-${area}"]`).boundingBox();
	if (!canvas) throw new Error(`Canvas not found for area=${area}`);

	const targetX = canvas.x + col * 256 + 128;
	const targetY = canvas.y + row * 16 + 16;

	await page.evaluate(
		({ moduleId, targetX, targetY, area }) => {
			const dt = new DataTransfer();
			dt.setData('text/plain', String(moduleId));
			const sel = `[data-testid="canvas-${area}"]`;
			const el = document.querySelector(sel) as HTMLElement | null;
			if (!el) throw new Error(`Canvas element not found: ${sel}`);
			el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, dataTransfer: dt }));
			el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, dataTransfer: dt }));
		},
		{ moduleId, targetX, targetY, area },
	);
	// Allow Vue reactivity to update
	await page.waitForTimeout(100);
}

/**
 * Create a cable by simulating a full drag from source jack to target jack.
 * Uses data-module-short scoped to canvas elements only.
 * If there are multiple modules of the same type, pick by occurrence index (0-based).
 */
export async function createCable(
	page: Page,
	src: { moduleShort: string; jackType: 'output'; connectorIdx?: number; occurrence?: number },
	dst: { moduleShort: string; jackType: 'input'; connectorIdx?: number; occurrence?: number },
): Promise<void> {
	const srcOccurrence = src.occurrence ?? 0;
	const dstOccurrence = dst.occurrence ?? 0;
	const srcConnector = src.connectorIdx ?? 0;
	const dstConnector = dst.connectorIdx ?? 0;

	await page.evaluate(
		({ src, dst }) => {
			function findJack(moduleShort: string, occurrence: number, jackData: string): Element | null {
				const modules = Array.from(document.querySelectorAll(`[data-testid^="canvas-"] [data-module-short="${moduleShort}"]`));
				const mod = modules[occurrence];
				return mod ? mod.querySelector(`[data-jack="${jackData}"]`) : null;
			}

			const srcJack = findJack(src.moduleShort, src.occurrence, `output-${src.connectorIdx}`);
			const dstJack = findJack(dst.moduleShort, dst.occurrence, `input-${dst.connectorIdx}`);
			if (!srcJack || !dstJack) throw new Error(`Jack not found: ${src.moduleShort}[${src.occurrence}] output-${src.connectorIdx} → ${dst.moduleShort}[${dst.occurrence}] input-${dst.connectorIdx}`);

			// Start the drag on the source jack
			srcJack.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true }));

			// Get screen coords of the destination jack for snap detection
			const dstRect = dstJack.getBoundingClientRect();
			const dstX = dstRect.left + dstRect.width / 2;
			const dstY = dstRect.top + dstRect.height / 2;

			// Simulate mouse movement so hasDragged=true and snapJack is set near the dst jack
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: dstX + 4, clientY: dstY + 4 }));
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: dstX, clientY: dstY }));

			// Window mouseup triggers cable creation via the snapJack mechanism
			window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: dstX, clientY: dstY }));
		},
		{ src: { moduleShort: src.moduleShort, occurrence: srcOccurrence, connectorIdx: srcConnector }, dst: { moduleShort: dst.moduleShort, occurrence: dstOccurrence, connectorIdx: dstConnector } },
	);
	await page.waitForTimeout(300);
}

/** Read the module/cable count shown in the status bar for the given area. */
export async function getStatusCounts(page: Page): Promise<{ voiceModules: number; voiceCables: number; fxModules: number; fxCables: number }> {
	const text = await page.locator('.flex.items-center.h-6.gap-2').innerText();
	const vm = text.match(/Voice:\s*(\d+)\s*modules\s*\/\s*(\d+)\s*cables/);
	const fx = text.match(/FX:\s*(\d+)\s*modules\s*\/\s*(\d+)\s*cables/);
	return {
		voiceModules: vm ? parseInt(vm[1]) : 0,
		voiceCables: vm ? parseInt(vm[2]) : 0,
		fxModules: fx ? parseInt(fx[1]) : 0,
		fxCables: fx ? parseInt(fx[2]) : 0,
	};
}

/** Select a module on the canvas by clicking its title bar, then press Delete. */
export async function deleteModule(page: Page, moduleShort: string, occurrence = 0): Promise<void> {
	// Click the drag handle rect (title bar) to select the module
	const handle = page.locator(`[data-testid^="canvas-"] [data-module-short="${moduleShort}"] [data-drag-handle]`).nth(occurrence);
	const box = await handle.boundingBox();
	if (!box) throw new Error(`Module drag handle not found: ${moduleShort}[${occurrence}]`);

	// Mousedown then immediate mouseup on the handle — no move, so useModuleDrag calls onModuleClick
	await page.mouse.move(box.x + 64, box.y + 8);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForTimeout(100);

	await page.keyboard.press('Delete');
	await page.waitForTimeout(100);
}
