# Nord Modular G2 - Editor

For user documentation see: https://janburp.github.io/NordModularG2-Editor/

## Support

This editor is free and built in spare time. If it's useful to you, please consider a [donation](https://www.paypal.com/donate/?hosted_button_id=UZE943PYKY5S6).

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

- [GitHub Pages](https://janburp.github.io/NordModularG2-Editor/) — getting started, alternatives, technical reference
- [USB Protocol](docs/technical/usb-protocol.md) — USB framing, commands, watch events, daemon architecture
- [Patch File Format](docs/technical/patch-format.md) — PCH2/PRF2 binary format, sections, bit encoding
- [CLI Commands](docs/technical/cli-commands.md) — full `g2-cli` command reference
- [Development Setup](docs/technical/development-setup.md) — build instructions

## Prerequisites

- **macOS**: `brew install libusb`
- **Windows**: handled via the release build script (MinGW cross-compile)

## Build & Test

Full reference: [Development Setup](docs/technical/development-setup.md) and [CLI Commands](docs/technical/cli-commands.md).

### CLI

```bash
cd cli
make                    # build
make test               # unit + cli + e2e; without a G2 the hardware suites print NOT RUN and are skipped
make test-unit          # unit tests, no G2
make test-cli           # one-shot CLI tests (no daemon), needs a G2
make test-e2e           # daemon tests, needs a G2
make test-e2e-slow      # bank-transfer daemon tests (get-bank/send-bank, minutes); not part of `make test`
./build/bin/g2-cli --help   # all commands
./g2tmux.sh             # tmux split: daemon output + command shell
```

Run on their own, the hardware suites exit 1 with "NOT RUN" when no G2 is connected, unless `G2_ALLOW_NO_DEVICE=1` is set.

### Electron App

```bash
cd g2-editor
npm install
cd ../cli && make && cd ../g2-editor   # rebuild CLI first
npm run postinstall     # copies CLI binary into app resources
npm run dev             # development server
npm run build           # production build + package
npm test                # unit + e2e + g2; g2 is skipped when no G2 is found
npm run test:unit       # Vitest unit tests
npm run typecheck       # vue-tsc type check
npm run lint            # ESLint
npm run test:e2e        # Playwright E2E tests, headless, no G2 (builds first)
npm run test:g2         # hardware suite: drives the CLI and the real editor against a connected G2
npm run test:duration -- --hours 1   # hours-long hardware duration test; --help lists options
```
