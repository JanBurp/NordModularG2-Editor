const { existsSync, mkdirSync, copyFileSync } = require('fs')
const { join } = require('path')

const isWin = process.platform === 'win32'
const binaryName = isWin ? 'g2-cli.exe' : 'g2-cli'
const srcFile = join(__dirname, '../../cli/build/bin', binaryName)
const destDir = join(__dirname, '../resources')
const destFile = join(destDir, binaryName)

try {
  if (!existsSync(srcFile)) {
    console.log(`CLI binary not found at ${srcFile} — skipping. Run make in cli/ first.`)
    process.exit(0)
  }
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  copyFileSync(srcFile, destFile)
  console.log(`CLI binary copied to resources/${binaryName}`)
} catch (e) {
  console.error('Failed to copy CLI:', e.message)
  process.exit(1)
}
