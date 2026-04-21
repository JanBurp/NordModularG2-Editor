"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
let win = null;
const cliPath = path.join(__dirname, "../resources/g2-cli");
function createWindow() {
  win = new electron.BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.maximize();
  win.show();
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
function runCli(args) {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const child = child_process.spawn(cliPath, args);
    let stdout = "";
    let stderr = "";
    (_a = child.stdout) == null ? void 0 : _a.on("data", (data) => {
      stdout += data.toString();
    });
    (_b = child.stderr) == null ? void 0 : _b.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Exit code: ${code}`));
      }
    });
    child.on("error", reject);
  });
}
electron.ipcMain.handle("cli:run", async (_, args) => {
  try {
    return await runCli(args);
  } catch (err) {
    throw new Error(err.message);
  }
});
electron.app.whenReady().then(createWindow);
