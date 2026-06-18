# Nord Modular G2 - Editor

For user documentation see: https://janburp.github.io/NordModularG2-Editor/

What follows is a brief technical overview and how to set up a local development environment.

## Tech Stack

- Editor for the Nord Modular G2 for multiple platforms (macOS, Windows, later Linux)
- Built with Electron, TypeScript, and Vue 3
- A C CLI/Daemon handles all USB communication with the G2 hardware

### CLI/Daemon in C

The CLI/Daemon handles all USB communication. All G2 responses go to stdout as JSON; all commands are sent via stdin.

This approach makes it possible to use the CLI/Daemon standalone, or from a different editor.

### ElectronJS

The Electron app can run in offline mode (editing files only, no G2 connected) or in online mode communicating with the G2 through the daemon.

## Repository Structure

- `cli/` — C CLI tool for USB communication with the G2 hardware
- `g2-editor/` — Electron desktop app (Vue 3 + TypeScript)
- `test-patches/` — Sample `.pch2` patch files for testing
- `doc/` — Module help files (used by in-app help)
- `docs/` — GitHub Pages documentation

## Documentation

- [GitHub Pages](https://janburp.github.io/NordModularG2-Editor/) — user guide, getting started, alternatives
- [USB Protocol](docs/technical/usb-protocol.md) — USB framing, commands, watch events, daemon architecture
- [Patch File Format](docs/technical/patch-format.md) — PCH2/PRF2 binary format, sections, bit encoding
- [CLI Commands](docs/technical/cli-commands.md) — full `g2-cli` command reference
- [Development Setup](docs/technical/development-setup.md) — build instructions

## Prerequisites

- **macOS**: `brew install libusb`
- **Windows**: handled via the release build script (MinGW cross-compile)

## Quick Build

### CLI

```bash
cd cli
make                    # build
make test               # run all tests
```

### Electron App

```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor
npm run postinstall     # copies CLI binary into app resources
npm run dev             # development server
```
