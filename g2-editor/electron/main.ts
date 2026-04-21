import { BrowserWindow, app, ipcMain } from 'electron'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..', '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173'
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

const cliPath = path.join(process.env.APP_ROOT, 'resources/g2-cli')

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.maximize();
  win.show();

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args)
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => { stdout += data.toString() })
    child.stderr?.on('data', (data) => { stderr += data.toString() })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `Exit code: ${code}`))
      }
    })

    child.on('error', reject)
  })
}

ipcMain.handle('cli:run', async (_, args: string[]) => {
  try {
    return await runCli(args)
  } catch (err: any) {
    throw new Error(err.message)
  }
})

app.whenReady().then(async () => {
  if (VITE_DEV_SERVER_URL) {
    try {
      const name = await installExtension(VUEJS_DEVTOOLS)
      console.log(`Added Extension: ${name}`)
    } catch (err) {
      console.log('An error occurred while installing Vue DevTools:', err)
    }
  }

  createWindow()
})
