const { execSync } = require('child_process')
const { writeFileSync, mkdirSync, rmSync } = require('fs')
const { join } = require('path')
const pngToIco = require('png-to-ico')

const resources = join(__dirname, '..', 'resources')
const src = join(resources, 'icon.png')

async function main() {
  // .icns via macOS built-in sips + iconutil
  const iconset = join(resources, 'icon.iconset')
  mkdirSync(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    execSync(`sips -z ${size} ${size} "${src}" --out "${join(iconset, `icon_${size}x${size}.png`)}"`, { stdio: 'ignore' })
    execSync(`sips -z ${size * 2} ${size * 2} "${src}" --out "${join(iconset, `icon_${size}x${size}@2x.png`)}"`, { stdio: 'ignore' })
  }
  execSync(`iconutil -c icns "${iconset}" -o "${join(resources, 'icon.icns')}"`)
  rmSync(iconset, { recursive: true })
  console.log('icon.icns created')

  // .ico via png-to-ico
  const buf = await pngToIco(src)
  writeFileSync(join(resources, 'icon.ico'), buf)
  console.log('icon.ico created')
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
