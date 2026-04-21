"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("cli", {
  run: (args) => electron.ipcRenderer.invoke("cli:run", args)
});
