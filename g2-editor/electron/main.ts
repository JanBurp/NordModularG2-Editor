import { BrowserWindow, app, ipcMain } from 'electron'

import { join } from 'path'
import { spawn } from 'child_process'

let win: BrowserWindow | null = null

const cliPath = join(__dirname, '../resources/g2-cli')

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.maximize();
  win.show();

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
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

app.whenReady().then(createWindow)
