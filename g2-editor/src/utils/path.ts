// Path helpers for renderer code: paths come from the OS, so accept both '/' and '\' separators.

export const baseName = (p: string) => p.split(/[/\\]/).pop() ?? p;

// Parent folder, or null when `dir` is a root ('/', 'C:\'). Root parents keep their separator.
export function parentDir(dir: string): string | null {
	const trimmed = dir.replace(/[/\\]+$/, '');
	const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
	if (i < 0) return null;
	const parent = trimmed.slice(0, i);
	return parent === '' || /^[A-Za-z]:$/.test(parent) ? trimmed.slice(0, i + 1) : parent;
}
