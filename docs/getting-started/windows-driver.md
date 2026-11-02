---
title: Windows USB Driver
parent: Getting Started
nav_order: 1
---

# Windows USB Driver

The editor talks to the G2 through **UsbDk**, a small, Microsoft-signed USB helper. The installer sets it up for you: Windows asks once for administrator permission while installing the editor. After that every G2, on any USB port, works without further steps.

UsbDk works *next to* Clavia's own G2 driver, so the original Clavia editor keeps working.

If UsbDk is missing (for example because the administrator prompt was declined), the editor shows a **USB Driver Problem** dialog. Click **Install USB helper**, allow the administrator prompt, and the editor connects.

## Windows on ARM

On Windows on ARM (Snapdragon laptops, Windows in a VM on an Apple Silicon Mac) neither UsbDk nor Clavia's driver can run, and the installer skips UsbDk. Use the WinUSB driver instead, see [Troubleshooting: WinUSB driver (Zadig)](#troubleshooting-winusb-driver-zadig).

## Removing UsbDk

Uninstalling the editor leaves UsbDk installed. To remove it: **Settings → Apps → Installed apps → UsbDk Runtime Libraries → Uninstall**. Restart Windows if asked.

## Troubleshooting: WinUSB driver (Zadig)

Only needed if UsbDk doesn't work on your PC. This was the setup for editor versions before UsbDk, and it replaces Clavia's driver, so the original editor stops working.

Install the **WinUSB** driver using [Zadig](https://zadig.akeo.ie/).

> **Important:** Run Zadig as Administrator (right-click → *Run as administrator*), otherwise it cannot replace or install the driver.

1. Open Zadig and select the **Nord G2** device.
2. Choose **WinUSB** as the driver.
3. Click **Replace/Install Driver**.

> **Note:** This replaces Clavia's original USB driver. You will need to reinstall the original Clavia driver if you want to use the original editor again.

### Windows 11: Driver Signature Enforcement

Windows 11 may block the unsigned WinUSB driver. If Zadig fails to install it, boot with signature enforcement disabled:

1. **Start → Power**, hold **Shift** and click **Restart**.
2. Go to **Troubleshoot → Advanced options → Startup Settings → Restart**.
3. Press **F7** — *Disable driver signature enforcement*.
4. Once Windows has booted, run Zadig as Administrator and install the driver as described above.
5. Reboot normally — the driver persists across reboots.

### Windows Keeps Restoring the Clavia Driver

Windows prefers Clavia's signed driver over Zadig's self-signed WinUSB driver. Whenever it sees a G2 as a "new" device — another G2, the same G2 on a different USB port, or a Windows Update driver pass — it may install the Clavia driver again.

This is most likely to happen with **multiple G2s**: each G2 (and each USB port it is plugged into) counts as a separate device, so every new combination is another chance for Windows to pick the Clavia driver.

- **Turn off automatic driver installs:** *Settings → System → About → Advanced system settings → Hardware → Device Installation Settings → No*.
- **Keep each G2 on the same USB port**, so Windows keeps recognising it as the same device.

#### Permanent fix: remove the Clavia G2 driver from the driver store

Windows keeps all installed drivers in a system-wide *driver store*; a driver can't be removed for just one G2. Removing Clavia's G2 package once makes every G2 fall back to WinUSB. Open a Command Prompt as Administrator with all G2s connected:

1. **Find the driver each G2 uses:**

   ```
   pnputil /enum-devices /connected /drivers
   ```

   Look for the entries containing `VID_0FFC&PID_0002` (Clavia's vendor ID, G2 product ID). The *Driver Name* line shows the package in use, e.g. `oem14.inf`. (Device Manager → G2 → Properties → Driver → Driver Details shows the same: `winusb.sys` means WinUSB, anything else is the Clavia driver.)
2. **Delete that Clavia package** (use your own number):

   ```
   pnputil /delete-driver oem14.inf /uninstall
   ```

   Only delete the package a G2 is actually bound to. You may see several Clavia packages in `pnputil /enum-drivers` (e.g. `claviacd.inf`, `claviawinusb.inf`, `clavia.inf`); the others may belong to other Nord instruments or Nord Sound Manager.
3. **Unplug and replug each G2** and check Driver Details shows `winusb.sys`. Any Zadig package already in the store fits every G2, so Windows usually picks WinUSB on its own. If not, run Zadig for that G2 as described above.

The original Clavia editor won't work until you reinstall the Clavia driver.

#### Optional: clean up duplicate Zadig drivers

Each Zadig run adds a new package to the driver store (shown with provider `libwdi` and names like `nord_modular_g2x.inf` or `nord_modular_g2_engine.inf`). They are harmless, but can pile up. With all G2s connected, run for each libwdi entry:

```
pnputil /delete-driver oemNN.inf
```

Without `/force`, Windows refuses to delete a package a device is using, so the ones your G2s need stay. Replug and check again that each G2 shows `winusb.sys`.


### Removing the Zadig/WinUSB Driver on Windows 11

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

