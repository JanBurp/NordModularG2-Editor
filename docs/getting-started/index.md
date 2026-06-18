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

## Download

| Platform | Editor | CLI (optional) |
|---|---|---|
| macOS Apple Silicon (M1/M2/M3/M4) | [G2-Editor-arm64.dmg](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-arm64.dmg) | [g2-cli-macos-arm64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-macos-arm64) |
| macOS Intel | [G2-Editor-x64.dmg](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-x64.dmg) | [g2-cli-macos-x64](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-macos-x64) |
| Windows | [G2-Editor-Setup.exe](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/G2-Editor-Setup.exe) | [g2-cli-windows-x64.exe](https://github.com/JanBurp/NordModularG2-Editor/releases/latest/download/g2-cli-windows-x64.exe) |

> The CLI is optional — most users only need the editor app. See [Technical Reference](../technical/cli-commands) for CLI details.

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

Run the `.exe` installer and follow the steps.

Windows requires a USB driver for the G2. If the app reports a USB driver problem, see [Windows USB Driver](windows-driver).
