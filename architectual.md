claude --resume d5e4e12d-a2a0-4158-b194-598efa80c498

# Architectural Investigation: USB Connection Approaches

## Current Architecture

C CLI tool (`cli/`) handles all USB communication. Electron spawns the CLI as a child process per command. A `watch` subcommand runs as a long-lived process polling for device events. Between commands, Electron stops watch → spawns CLI command → restarts watch.

**Pros:** Easy to test, clear separation, CLI usable standalone.
**Con:** USB disconnect/reconnect on every command; event gap during reconnect; process spawn overhead.

---

## Option 1: Persistent CLI Daemon

Add a `daemon` subcommand to the existing C CLI. The daemon owns the USB connection permanently, runs the watch loop in one thread, and accepts commands on another channel (stdin/stdout or Unix domain socket). Electron spawns the daemon once at startup.

**How:** `pthreads` in C — one thread for the watch loop, one for command dispatch. Connection handle stays open. The existing one-shot CLI mode remains intact.

| | Current (spawn) | Daemon |
|---|---|---|
| Persistent connection | No | Yes |
| Reconnect gap | Yes | No |
| Complexity | Low | Medium |
| Standalone CLI | Yes | Yes |
| Codebase | C + TS | C + TS |

**Verdict:** Real improvement (no gaps, faster), but adds threading complexity in C and daemon lifecycle management in Electron.

---

## Option 2: WebUSB (replace CLI entirely)

Drop the C CLI and access the G2 directly from Electron's Chromium renderer via the WebUSB API.

**Feasibility for the G2:**
- VID `0x0ffc` / PID `0x0002`
- Uses bulk (0x03 OUT, 0x82 IN) and interrupt (0x81 IN) transfers — both fully supported by WebUSB
- Current CLI never calls `libusb_detach_kernel_driver()` — OS doesn't claim this device, so WebUSB can access it without workarounds
- Electron can auto-grant USB device permissions programmatically (no user-gesture requirement)

**Single connection with watch + commands:** Natural in JS. Open device once, poll interrupt endpoint in an async loop (`transferIn()` on 0x81), send commands via `transferOut()` on 0x03. JS event loop handles interleaving without threading.

| | Current (spawn) | Daemon (C) | WebUSB |
|---|---|---|---|
| Persistent connection | No | Yes | Yes |
| Reconnect gap | Yes | No | No |
| Architecture complexity | Low | Medium | Low |
| Language | C + TS | C + TS | TS only |
| Standalone CLI | Yes | Yes | No |
| Debugging | Hard (binary) | Hard | DevTools |
| Maintenance | Two codebases | Two codebases | One |

**Risks:**
- Lose standalone CLI tool permanently
- Chromium USB stack less battle-tested than libusb for vendor-specific devices
- Reconnect/rearm logic needs reimplementing in TS
- macOS/Windows WebUSB behaviour can vary subtly across OS versions

**Verdict:** Architecturally cleanest option if the standalone CLI is not needed. One language, one process, persistent connection, natural async model. Lower technical risk than typical WebUSB scenarios because no kernel driver detachment is required.

---

## Testability Comparison

The current CLI tests by running it as a subprocess against a real device or feeding fixture binary responses via stdin/pipes — works cleanly in CI.

| | CLI (current) | WebUSB |
|---|---|---|
| Unit tests | C (`make test`) + Vitest for parser | Vitest only, mock `navigator.usb` — easier |
| Integration without hardware | Subprocess + binary fixtures | Needs virtual USB device or Playwright/Electron harness |
| Integration with hardware | Simple CLI invocation | Same hardware, more complex harness |

**Unit tests** become easier with WebUSB: all logic is TypeScript, `navigator.usb` is mockable in Vitest like any interface. Existing parser tests are unaffected.

**Integration tests** are the gap: the CLI is a binary driveable at shell level. WebUSB runs inside Electron's Chromium renderer, so end-to-end tests without hardware require a full Electron/Playwright harness or OS-level virtual USB — a meaningful step up in CI infrastructure complexity.
