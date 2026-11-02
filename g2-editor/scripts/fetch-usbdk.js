// Downloads the pinned UsbDk installer (Apache-2.0, https://github.com/daynix/UsbDk) into resources/
// for the Windows build. The NSIS installer runs it once, so the G2 needs no Zadig/WinUSB driver.
const { createHash } = require('crypto')
const { existsSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const URL = 'https://github.com/daynix/UsbDk/releases/download/v1.00-22/UsbDk_1.0.22_x64.msi'
const SHA256 = '91f6f695e1e13c656024e6d3b55620bf08d8835ef05ee0496935ba6bb62466a5'
const dest = join(__dirname, '../resources/UsbDk_x64.msi')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

;(async () => {
  if (existsSync(dest) && sha256(readFileSync(dest)) === SHA256) {
    console.log('UsbDk already in resources/ — skipping.')
    return
  }
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (sha256(buf) !== SHA256) throw new Error('SHA-256 mismatch')
  writeFileSync(dest, buf)
  console.log('UsbDk downloaded to resources/UsbDk_x64.msi')
})().catch((e) => {
  console.error('Failed to fetch UsbDk:', e.message)
  process.exit(1)
})
