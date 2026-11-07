G2 Editor - Nord Modular G2 editor
==================================

Click "I Agree" to continue. (This is not a license.)

USB HELPER (UsbDk)
The installer also installs UsbDk, a small Microsoft-signed USB helper
the editor needs to talk to the G2. Windows asks once for administrator
permission: allow it. Clavia's own G2 driver stays installed, so the
original Clavia editor keeps working.

If the editor later shows "USB Driver Problem": click "Install USB
helper" and allow the administrator prompt. If it says UsbDk is
installed but not active yet, restart Windows.

WINDOWS ON ARM
UsbDk can't run on Windows on ARM (e.g. Snapdragon laptops), so the
installer skips it. Use the WinUSB driver via Zadig instead, see:
https://janburp.github.io/NordModularG2-Editor/getting-started/windows-driver

MORE HELP
https://janburp.github.io/NordModularG2-Editor/getting-started/
