---
title: Windows USB Driver
parent: Getting Started
nav_order: 1
---

# Windows USB Driver

The editor requires the **WinUSB** driver for the Nord G2. If the app reports a USB driver problem, install it using [Zadig](https://zadig.akeo.ie/).

> **Important:** Run Zadig as Administrator (right-click → *Run as administrator*), otherwise it cannot replace or install the driver.

1. Open Zadig and select the **Nord G2** device.
2. Choose **WinUSB** as the driver.
3. Click **Replace/Install Driver**.

> **Note:** This replaces Clavia's original USB driver. You will need to reinstall the original Clavia driver if you want to use the original editor again.

## Windows 11: Driver Signature Enforcement

Windows 11 may block the unsigned WinUSB driver. If Zadig fails to install it, boot with signature enforcement disabled:

1. **Start → Power**, hold **Shift** and click **Restart**.
2. Go to **Troubleshoot → Advanced options → Startup Settings → Restart**.
3. Press **F7** — *Disable driver signature enforcement*.
4. Once Windows has booted, run Zadig as Administrator and install the driver as described above.
5. Reboot normally — the driver persists across reboots.

## Windows Keeps Restoring the Clavia Driver

Windows prefers Clavia's signed driver over Zadig's self-signed WinUSB driver. Whenever it sees a G2 as a "new" device — another G2, the same G2 on a different USB port, or a Windows Update driver pass — it may install the Clavia driver again.

- **Turn off automatic driver installs:** *Settings → System → About → Advanced system settings → Hardware → Device Installation Settings → No*.
- **Keep each G2 on the same USB port**, so Windows keeps recognising it as the same device.
- **Permanent fix — remove the Clavia driver from Windows' driver store.** In a Command Prompt opened as Administrator:
  1. `pnputil /enum-drivers` — find the entry whose provider is Clavia/Nord and note its *Published Name* (e.g. `oem12.inf`).
  2. `pnputil /delete-driver oem12.inf /uninstall` (use your own number).
  3. Run Zadig again for each G2 as described above.

  The original Clavia editor won't work until you reinstall the Clavia driver.


## Removing the Zadig/WinUSB Driver on Windows 11

Step 1: Uninstall the WinUSB driver

1. Connect the Nord G2 to your PC
2. Open Device Manager (Win + X → Device Manager)
3. Find the Nord G2 — it will likely appear under "Universal Serial Bus devices" or "WinUSB devices" (not as a MIDI device)
4. Right-click the device → Uninstall device
5. Check "Attempt to remove the driver for this device" (or "Delete the driver software for this device")
6. Click Uninstall
7. Disconnect the G2

If Windows reverts to WinUSB automatically on reconnect:

- After uninstalling, also open Device Manager → View → Show hidden devices
- Look under "Ports (COM & LPT)" or "Sound, video and game controllers" for any ghost entries and uninstall those too
- Then run the Clavia installer

Tip: If the Clavia driver installer doesn't detect the device properly, try running it as Administrator.

