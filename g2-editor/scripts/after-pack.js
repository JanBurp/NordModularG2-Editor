// electron-builder 24 applies `electronLanguages` to the app's own Contents/Resources on macOS,
// not to Electron Framework's Resources where the ~50 locale folders actually live. Prune those
// here (afterPack runs before signing) so they are neither signed nor shipped.
const { readdirSync, rmSync } = require('fs')
const { join } = require('path')

exports.default = async function afterPack({ appOutDir, packager, electronPlatformName }) {
	if (electronPlatformName !== 'darwin') return
	const wanted = [].concat(packager.platformSpecificBuildOptions.electronLanguages ?? [])
	if (!wanted.length) return
	const dir = join(
		appOutDir,
		`${packager.appInfo.productFilename}.app`,
		'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources',
	)
	for (const file of readdirSync(dir)) {
		if (file.endsWith('.lproj') && !wanted.includes(file.slice(0, -'.lproj'.length))) {
			rmSync(join(dir, file), { recursive: true, force: true })
		}
	}
}
