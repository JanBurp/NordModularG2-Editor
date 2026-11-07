G2 Editor - Nord Modular G2 editor (Linux & Raspberry Pi)
=========================================================

REQUIREMENTS
- 64-bit Linux with glibc 2.35 or newer (Ubuntu 22.04+, Debian 12+,
  Linux Mint 21+, Fedora 36+).
- Raspberry Pi 4 or 5 with Raspberry Pi OS (64-bit), Bookworm or newer.
  `uname -m` must say aarch64.

No driver is needed, only USB permission for your user.

INSTALL: .deb (Ubuntu, Debian, Mint, Raspberry Pi OS)
  sudo apt install ./G2-Editor-linux-amd64.deb     (PC)
  sudo apt install ./G2-Editor-linux-arm64.deb     (Raspberry Pi)
The package also sets up USB permission. If the G2 was already plugged
in, unplug and replug it once. Start G2 Editor from your applications menu.

INSTALL: AppImage (any distribution)
  chmod +x G2-Editor-linux-x86_64.AppImage
  ./G2-Editor-linux-x86_64.AppImage
- Needs FUSE 2: sudo apt install libfuse2
  (Ubuntu 24.04 and newer: libfuse2t64).
- The arm64 AppImage also needs: sudo apt install zlib1g-dev
- First connect: the editor shows "USB Driver Problem". Click
  "Install USB helper" and enter your password (only needed once).
- Ubuntu 24.04+ sandbox error: use the .deb, or start the AppImage
  with --no-sandbox.

MORE HELP
https://janburp.github.io/NordModularG2-Editor/getting-started/linux
