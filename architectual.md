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

---

## Performance & Stability: Daemon vs WebUSB

### Performance (UX experience): essentially identical

USB hardware round-trip dominates (1–4ms on USB Full Speed). Added overhead:

- **Daemon:** IPC hop (pipe/socket) + libusb → ~0.5ms overhead over raw USB
- **WebUSB:** Chromium's Blink USB layer → slightly thicker than libusb, but imperceptible for the G2's small packet sizes

Neither approach is the bottleneck — G2 hardware response time is.

### Stability

| Scenario | Daemon | WebUSB |
|---|---|---|
| Device unplugged mid-session | C reconnect loop already exists and tested | Must reimplement: catch `NetworkError`, re-open, re-claim interface |
| Bulk endpoint stall after reconnect | `g2_drain_pending()` already handles this | Must reimplement drain logic in JS — easy to get wrong |
| USB transfer timeout | libusb error codes, mature error handling | Promise rejection — straightforward but untested against G2 |
| Stack crash | Daemon is separate process; Electron detects and restarts | Renderer crash = USB lost (but that's also a full UI crash) |
| Chromium USB quirks | Not applicable | Less predictable than libusb for vendor-specific edge cases |

**Key risk for WebUSB:** The `g2_drain_pending()` logic clears the bulk-IN FIFO before arming/re-arming the watch loop. Without it the G2's endpoint stalls silently. The daemon already has this working; WebUSB requires reimplementing it in JS — not complex, but a known failure mode that needs revalidation.

---

## Daemon IPC: How C Communicates with Electron

Three options, in order of practicality for this project:

### Option A: stdin/stdout (recommended)

The current Electron code already spawns the CLI with `child_process.spawn()` and reads stdout for watch events. The daemon extends this bidirectionally:

- Electron writes commands to daemon's **stdin** (newline-delimited JSON: `{"cmd":"add-module","args":[...]}\n`)
- Daemon writes responses and events to **stdout** (same JSON format as now)
- Electron already has the stdout read-loop infrastructure

Minimal changes to Electron. Daemon polls both stdin (commands) and USB (events) in its main loop. Works on all platforms.

### Option B: Unix socket / named pipe

Daemon creates a socket at a known path (e.g. `/tmp/g2-daemon.sock`). Electron connects via Node.js `net.createConnection()`. Full duplex, same JSON protocol. Node.js `net` handles both Unix sockets (macOS/Linux) and Windows named pipes with the same API.

**Advantage over stdin/stdout:** Electron can disconnect and reconnect without killing the daemon — useful if the daemon should outlive an Electron restart.

### Option C: localhost TCP

Daemon listens on a local port. Cross-platform, but overkill for a single local process and risks port conflicts.

**Recommendation:** stdin/stdout. It's already half-implemented (watch events already flow over stdout). Add stdin command reading to the daemon and a write path in Electron — no new infrastructure needed.

---

## Daemon: Interactive CLI Testing While Connected

Can you keep the daemon running (watch active) and send commands from a second terminal? Depends on the IPC choice.

### stdin/stdout
stdin is owned by the process that spawned the daemon — a second terminal can't inject commands. Workaround: use a named FIFO as the daemon's stdin (`mkfifo /tmp/g2-in`), then `echo '{"cmd":"..."}' > /tmp/g2-in` from another terminal. Works but is clunky.

### Unix socket
Natural fit. Terminal 1 runs the daemon; watch events stream to stdout. Terminal 2 connects and sends commands interactively:
```
socat - UNIX-CONNECT:/tmp/g2-daemon.sock
# or:
nc -U /tmp/g2-daemon.sock
```
Multiple clients can connect simultaneously (e.g. Electron + test terminal at the same time).

### Hybrid (best of both)
**Socket for command input + stdout for events.** Electron switches from stdin to socket (`net.createConnection()`). A thin `g2-cli send '{"cmd":"..."}'` wrapper connects to the socket, sends one command, prints the response, and exits — same feel as the current one-shot CLI.

**Verdict:** stdin/stdout is simpler for Electron but kills interactive CLI testing. If testing from a second terminal matters, the Unix socket approach is worth the small extra complexity.
