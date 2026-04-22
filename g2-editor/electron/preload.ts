import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cli", {
	run: (args: string[]) => ipcRenderer.invoke("cli:run", args),
});
