---
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

## System Requirements

| Platform | Minimum OS |
|---|---|
| macOS (Apple Silicon & Intel) | macOS 11 (Big Sur) |
| Windows | Windows 10 (64-bit) |
| Linux (x64) | 64-bit, glibc 2.35+ (e.g. Ubuntu 22.04, Debian 12) |
| Raspberry Pi (arm64) | Pi 4/5, Raspberry Pi OS 64-bit (Bookworm) |

## Latest version

**v0.8.1** — released 2026-11-06

## Download

| Platform | Editor | CLI (optional) |
|---|---|---|
| macOS Apple Silicon (M1/M2/M3/M4) | [G2-Editor-arm64.dmg](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-arm64.dmg) | [g2-cli-macos-arm64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-macos-arm64) |
| macOS Intel | [G2-Editor-x64.dmg](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-x64.dmg) | [g2-cli-macos-x64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-macos-x64) |
| Windows | [G2-Editor-Setup.exe](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-Setup.exe) | [g2-cli-windows-x64.exe](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-windows-x64.exe) |
| Linux x64 | [.deb](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-linux-amd64.deb) · [AppImage](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-linux-x86_64.AppImage) | [g2-cli-linux-x64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-linux-x64) |
| Raspberry Pi (arm64) | [.deb](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-linux-arm64.deb) · [AppImage](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-linux-arm64.AppImage) | [g2-cli-linux-arm64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-linux-arm64) |

> The CLI is optional — most users only need the editor app. See [Technical Reference](../technical/cli-commands) for CLI details.

> The editor is free. If it's useful to you, a [donation](https://www.paypal.com/donate/?hosted_button_id=UZE943PYKY5S6) helps keep it going.

## Install: macOS

1. Open the `.dmg` and drag **G2 Editor** to your Applications folder.
2. On first launch macOS may block the app because it is not notarized:
   - **"unidentified developer"**: Right-click the app icon → **Open** → confirm.
   - **"damaged and can't be opened"**: open Terminal and run:
     ```
     xattr -cr /Applications/G2\ Editor.app
     ```
     Then launch the app normally.

## Install: Windows

Run the `.exe` installer and follow the steps. The first time, Windows asks for administrator permission to install the USB helper (UsbDk) the editor needs; Clavia's own driver stays installed. See [Windows USB Driver](windows-driver).

## Install: Linux & Raspberry Pi

Install the `.deb` (Ubuntu, Debian, Mint, Raspberry Pi OS) or run the AppImage (any distribution). No driver is needed, only USB permission, which the `.deb` or the editor sets up for you. See [Linux & Raspberry Pi](linux).
