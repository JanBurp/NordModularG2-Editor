import type { Locator, Page } from '@playwright/test';

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

type JackRef = { moduleShort: string; jackType: 'input' | 'output'; connectorIdx: number; occurrence?: number };

/**
 * Ctrl/Cmd-drag an existing cable's endpoint to relocate or delete it (the new cable-editing gesture).
 * `cableIndex` selects which cable to grab, by DOM render order (0-based; cables render in creation order).
 * `grabNear` is the jack whose end of that cable gets grabbed. `target` is the destination jack,
 * or `{ empty: true }` to drop in empty canvas space (deletes the cable).
 */
export async function grabAndDropCableEnd(page: Page, cableIndex: number, grabNear: JackRef, target: JackRef | { empty: true }): Promise<void> {
	await page.evaluate(
		({ cableIndex, grabNear, target }) => {
			function findJack(moduleShort: string, occurrence: number, jackData: string): Element | null {
				const modules = Array.from(document.querySelectorAll(`[data-testid^="canvas-"] [data-module-short="${moduleShort}"]`));
				const mod = modules[occurrence];
				return mod ? mod.querySelector(`[data-jack="${jackData}"]`) : null;
			}

			const hitAreas = Array.from(document.querySelectorAll<SVGPathElement>('.cable-hit'));
			const hitArea = hitAreas[cableIndex];
			if (!hitArea) throw new Error(`Cable hit-area not found at index ${cableIndex}`);

			const grabJack = findJack(grabNear.moduleShort, grabNear.occurrence ?? 0, `${grabNear.jackType}-${grabNear.connectorIdx}`);
			if (!grabJack) throw new Error(`Jack not found: ${grabNear.moduleShort} ${grabNear.jackType}-${grabNear.connectorIdx}`);
			const grabRect = grabJack.getBoundingClientRect();
			const grabX = grabRect.left + grabRect.width / 2;
			const grabY = grabRect.top + grabRect.height / 2;

			let toX: number, toY: number;
			if ('empty' in target) {
				toX = 40;
				toY = 500;
			} else {
				const targetJack = findJack(target.moduleShort, target.occurrence ?? 0, `${target.jackType}-${target.connectorIdx}`);
				if (!targetJack) throw new Error(`Target jack not found: ${target.moduleShort} ${target.jackType}-${target.connectorIdx}`);
				const targetRect = targetJack.getBoundingClientRect();
				toX = targetRect.left + targetRect.width / 2;
				toY = targetRect.top + targetRect.height / 2;
			}

			hitArea.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true, ctrlKey: true, clientX: grabX, clientY: grabY }));
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ctrlKey: true, clientX: (grabX + toX) / 2, clientY: (grabY + toY) / 2 }));
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ctrlKey: true, clientX: toX, clientY: toY }));
			window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, ctrlKey: true, clientX: toX, clientY: toY }));
		},
		{ cableIndex, grabNear, target },
	);
	await page.waitForTimeout(300);
}

/** Read the module/cable count shown in the status bar for the given area. */
export async function getStatusCounts(page: Page): Promise<{ voiceModules: number; voiceCables: number; fxModules: number; fxCables: number }> {
	const text = await page.locator('[data-testid="status-counts"]').innerText();
	const vm = text.match(/Voice:\s*(\d+)\s*modules\s*\/\s*(\d+)\s*cables/);
	const fx = text.match(/FX:\s*(\d+)\s*modules\s*\/\s*(\d+)\s*cables/);
	return {
		voiceModules: vm ? parseInt(vm[1]) : 0,
		voiceCables: vm ? parseInt(vm[2]) : 0,
		fxModules: fx ? parseInt(fx[1]) : 0,
		fxCables: fx ? parseInt(fx[2]) : 0,
	};
}

/** Right-click a locator and wait for the context menu to appear. */
export async function openContextMenu(page: Page, locator: Locator): Promise<void> {
	// locator.boundingBox() returns null for SVG <g> elements; evaluate getBoundingClientRect() directly
	const rect = await locator.evaluate((el) => {
		const r = (el as Element).getBoundingClientRect();
		return { x: r.left, y: r.top, width: r.width, height: r.height };
	});
	await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2, { button: 'right' });
	await page.waitForSelector('[data-testid="context-menu"]', { state: 'visible' });
}

/** Click a context menu item by its visible label text. */
export async function clickContextMenuItem(page: Page, label: string): Promise<void> {
	await page.getByRole('menuitem', { name: label, exact: true }).click();
	await page.waitForTimeout(100);
}

/** Hover a context menu item to open its submenu. */
export async function hoverContextMenuItem(page: Page, label: string): Promise<void> {
	await page.getByRole('menuitem', { name: label, exact: true }).hover();
	await page.waitForTimeout(200);
}

/** Select a module on the canvas by clicking its title bar, then delete it.
 *  Pass deleteAction to use sendMenuAction('delete') — required in Electron tests because
 *  page.keyboard.press('Delete') dispatches DOM events that don't trigger menu accelerators. */
export async function deleteModule(
	page: Page,
	moduleShort: string,
	occurrence = 0,
	deleteAction?: () => Promise<void>,
): Promise<void> {
	const handle = page.locator(`[data-testid^="canvas-"] [data-module-short="${moduleShort}"] [data-drag-handle]`).nth(occurrence);
	const box = await handle.boundingBox();
	if (!box) throw new Error(`Module drag handle not found: ${moduleShort}[${occurrence}]`);

	await page.mouse.move(box.x + 64, box.y + 8);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForTimeout(100);

	if (deleteAction) {
		await deleteAction();
	} else {
		await page.keyboard.press('Delete');
	}
	await page.waitForTimeout(100);
}
