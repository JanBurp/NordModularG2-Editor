---
title: Linux & Raspberry Pi
parent: Getting Started
nav_order: 2
---

# Linux & Raspberry Pi

The editor runs on 64-bit Linux on PCs (x64) and on the Raspberry Pi (arm64). No driver is needed: Linux talks to the G2 directly. The only thing to set up is **permission** for your user to open the G2, and the editor can do that for you.

## Requirements

- A 64-bit Linux with glibc 2.35 or newer, e.g. Ubuntu 22.04+, Debian 12+, Linux Mint 21+, Fedora 36+.
- **Raspberry Pi:** a Pi 4 or Pi 5 with **Raspberry Pi OS (64-bit)**, Bookworm or newer. Check with `uname -m`: it must say `aarch64`. The 32-bit OS is not supported.

## Install: .deb (Ubuntu, Debian, Mint, Raspberry Pi OS)

Download the `.deb` for your machine (`amd64` for a PC, `arm64` for a Pi) and install it:

```
sudo apt install ./G2-Editor-linux-amd64.deb
```

The package also installs the USB permission rule. If the G2 was already plugged in, unplug it and plug it back in once. Start **G2 Editor** from your applications menu.

## Install: AppImage (any distribution)

Download the `.AppImage` for your machine (`x86_64` for a PC, `arm64` for a Pi), make it executable and run it:

```
chmod +x G2-Editor-linux-x86_64.AppImage
./G2-Editor-linux-x86_64.AppImage
```

AppImages need FUSE 2. On Ubuntu 22.04 and Debian install it with `sudo apt install libfuse2`; on Ubuntu 24.04 and newer the package is called `libfuse2t64`.

The first time you connect, the editor shows a **USB Driver Problem** dialog saying you have no permission to open the G2. Click **Install USB helper** and enter your password. The editor installs the permission rule and connects. This is needed only once.

## Setting up USB permission by hand

If you prefer to do it yourself, or the button doesn't work on your system, create `/etc/udev/rules.d/70-nord-g2.rules` with this single line:

```
SUBSYSTEM=="usb", ATTR{idVendor}=="0ffc", ATTR{idProduct}=="0002", MODE="0660", TAG+="uaccess"
```

Then reload the rules and unplug/replug the G2:

```
sudo udevadm control --reload-rules
sudo udevadm trigger
```

`TAG+="uaccess"` gives access to whoever is logged in at the desktop, so no group membership is needed. On a system without a desktop login (e.g. using only the CLI over SSH), use `MODE="0666"` instead.

## Troubleshooting

- **The AppImage doesn't start on Ubuntu 24.04 or newer** (an error mentioning the *sandbox*): Ubuntu restricts the sandbox AppImages use. Use the `.deb` instead, or start the AppImage with `--no-sandbox`.
- **Still no permission after installing the rule:** unplug and replug the G2, or log out and in again. Check that the rule is in place with `ls /etc/udev/rules.d/70-nord-g2.rules`.
- **Uninstalling:** `sudo apt remove g2-editor` also removes the permission rule. If you used the AppImage, delete the AppImage and, if you like, `/etc/udev/rules.d/70-nord-g2.rules`.
