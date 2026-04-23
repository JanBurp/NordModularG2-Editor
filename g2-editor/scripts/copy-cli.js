const { execSync } = require('child_process')
const { existsSync, mkdirSync, copyFileSync } = require('fs')
const { join } = require('path')

const srcDir = join(__dirname, '../../cli/build/bin')
const destDir = join(__dirname, '../resources')
const destFile = join(destDir, 'g2-cli')

try {
  if (!existsSync(srcDir)) {
    console.log('CLI not built yet. Run "make" in cli/ directory first.')
    process.exit(0)
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  copyFileSync(join(srcDir, 'g2-cli'), destFile)
  console.log('CLI binary copied to resources/')
} catch (e) {
  console.error('Failed to copy CLI:', e.message)
  process.exit(1)
}
