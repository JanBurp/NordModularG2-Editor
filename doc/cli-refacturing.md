# CLI Daemon vs Delphi USB Command Patterns

Comparison of how the C CLI daemon (`cli/src/`) handles USB commands versus the reference Delphi implementation (`BVE.NMG2USB.pas`). Focus: `set-perf-mode`, `*-module`, and `*-cable-*` commands.

---

## CLI Daemon Pattern

Every command in `daemon.c` is wrapped identically:

```
g2_watch_disarm()          → sends STOP_COMM + g2_drain_pending()
  g2_drain_pending()       → flush before send (inside each impl in g2_device.c)
  send(0xNN, payload)
  recv_interrupt()
  g2_drain_pending()       → flush after recv
g2_watch_rearm()           → g2_drain_pending() + sends START_COMM
```

**Exception**: `set-perf-mode` additionally calls `g2_send_init()` BEFORE the disarm — resets patch version counters.

Key sources:
- `cli/src/daemon.c` lines 166, 279–288, 319
- `cli/src/g2_device.c` lines 930–1303
- `cli/src/g2_watch.c` lines 26–47

---

## Delphi Pattern

### Module/cable commands — no STOP_COMM/START_COMM

All module/cable operations go through `SendCmdMessage()`, which guards with `FWaitForCmd`:

- Non-zero → discard the new command (waiting for response)
- Zero → set `FWaitForCmd := command_byte`, call `USBSendMessage()`
- On response → `FWaitForCmd := 0` → next send unblocked

**No STOP_COMM or START_COMM is sent around individual module/cable commands.**

### set-perf-mode — triggers full USBStartInit

```delphi
procedure TG2USB.SetPerfMode(aValue: TBits1);
begin
  SendSetModeMessage(aValue);
  (Performance as TG2USBPerformance).USBStartInit(True);
end;
```

`USBStartInit` sequences via `USBInitSeq` callbacks:
1. STOP_COMM
2. GetPatchVersion
3. GetSynthSettings
4. Unknown1
5. Performance init
6. Bank list walk
7. START_COMM → `FInitialized := True`

---

## Comparison

| Aspect | CLI Daemon | Delphi |
|--------|------------|--------|
| **Drain pending** | Explicit `g2_drain_pending()` — flushes all pending USB interrupt data before/after each send | `FWaitForCmd` mutex — blocks new commands until response received; no bulk flush |
| **STOP/START per module/cable command** | YES — wraps every command | **NO** — only during init sequences |
| **set-perf-mode init** | `g2_send_init()` (lightweight patch version reset) + disarm/rearm | `USBStartInit()` (full re-init: STOP_COMM + re-fetch all state + START_COMM) |

### Summary table

| Command group | Delphi STOP/START | Delphi drain | CLI STOP/START | CLI drain |
|---|---|---|---|---|
| `set-perf-mode` | Only inside `USBStartInit()` re-init | `FWaitForCmd` guard | YES + `g2_send_init()` | drain before + after |
| `*-module` | **None** | `FWaitForCmd` guard | YES (disarm/rearm) | drain before + after |
| `*-cable-*` | **None** | `FWaitForCmd` guard | YES (disarm/rearm) | drain before + after |

---

## Implication

The CLI wraps every module/cable command with STOP_COMM + START_COMM. The Delphi app does not — it sends those commands into an active streaming session and serializes via `FWaitForCmd`. **The CLI's per-command disarm/rearm has no Delphi precedent.**

This suggests the STOP_COMM/START_COMM around module/cable commands may be overly conservative (defensive programming from early development). Worth testing whether those commands work correctly without disarm/rearm, which would simplify the daemon considerably and match Delphi's approach more closely.

---

## Investigation: Drain-Only Approach (May 2026)

Attempted removing disarm/rearm from daemon commands, replacing with `g2_drain_pending()`
before and after each send. Also added BULK_REARM detection to drain (re-arms after
consuming any all-slots version update extended message), and filtered LED/volume events
in `recv_interrupt` retry loops.

**Result: Hardware still unresponsive after slot/variation commands.**

Key observation: When the daemon appears stuck, pressing a slot button ON THE G2 HARDWARE
wakes the watch stream back up. This means:
- The USB connection is alive
- The G2 is still capable of sending events
- The watch loop is still running and reacts to hardware-initiated events
- BUT: commands sent from the daemon are not reaching the G2 correctly

Root cause (not yet fixed): Device commands (`g2_select_slot`, `g2_select_variation`) call
`recv_interrupt()` from within `daemon_tick()`, which is called synchronously from inside
the watch loop. Even though there is no concurrent access (the watch loop is blocked while
daemon_tick runs), the interleaving of streaming events with command responses causes:
1. `recv_interrupt()` in commands reads LED/volume events instead of command responses
2. Command responses flow back to the watch loop on the next iteration (wrong context)
3. Stream gets out of sync; subsequent commands mis-read their acknowledgments

---

## Delphi Thread Architecture (Reference for Future Fix)

The Delphi editor (BVE.NMG2USB.pas) uses a 3-component model that avoids this entirely:

### TListeningThread (background thread)
- **Sole reader** of EP 0x81 (interrupt) and EP 0x82 (bulk)
- Tight loop: `FUSB.InterruptRead(iin_buf, 16)` with infinite timeout
- When EXTENDED: immediately calls `BulkRead()` on EP 0x82 to drain bulk
- Passes each complete message to main thread via `Queue(ProcessMessageQueued)`
  (VCL message queue — equivalent to PostMessage in Win32)
- Never sends anything, never makes decisions about message type

### Main/UI Thread (command correlator)
- Receives messages from TListeningThread via Queue
- In `DoResponseMessageQueued`: checks `FSendMessageCount > 0`
  - If > 0: this interrupt is the **command response** — dequeue, advance state machine
  - If == 0: this interrupt is a **watch event** — route to event handlers
- LED/volume data (`IsLedData`) always bypasses the command-response path
- Sends all commands via EP 0x03 (bulk OUT)
- Handles BULK_REARM (all-slots version update) via `Perf.StartInit` → START_COMM

### TSendParamThread (background thread)
- Dedicated only to no-response parameter writes (S_SET_PARAM, etc.)
- Waits on TEvent, batch-sends via EP 0x03
- Never reads from any endpoint

### Key properties
- Only one thread ever reads EP 0x81 — no contention, no missed messages
- Commands and events share EP 0x81 FIFO; correlation is by state (FSendMessageCount)
  not by timing or separate channels
- START_COMM is only sent during init sequence and after BULK_REARM — never per-command
- FWaitForCmd serializes commands: next send blocked until response received

### C equivalent design (future work)
Move `g2_watch()` to a background thread (the "listener"). Command execution stays on
the main thread. The listener passes received messages to the main thread via a
mutex+condvar queue. Device functions (`g2_select_slot` etc.) send via EP 0x03, then
wait on the queue for their response — no direct `recv_interrupt()` calls.
# CLI Daemon vs Delphi USB Command Patterns

Comparison of how the C CLI daemon (`cli/src/`) handles USB commands versus the reference Delphi implementation (`BVE.NMG2USB.pas`). Focus: `set-perf-mode`, `*-module`, and `*-cable-*` commands.

---

## CLI Daemon Pattern

Every command in `daemon.c` is wrapped identically:

```
g2_watch_disarm()          → sends STOP_COMM + g2_drain_pending()
  g2_drain_pending()       → flush before send (inside each impl in g2_device.c)
  send(0xNN, payload)
  recv_interrupt()
  g2_drain_pending()       → flush after recv
g2_watch_rearm()           → g2_drain_pending() + sends START_COMM
```

**Exception**: `set-perf-mode` additionally calls `g2_send_init()` BEFORE the disarm — resets patch version counters.

Key sources:
- `cli/src/daemon.c` lines 166, 279–288, 319
- `cli/src/g2_device.c` lines 930–1303
- `cli/src/g2_watch.c` lines 26–47

---

## Delphi Pattern

### Module/cable commands — no STOP_COMM/START_COMM

All module/cable operations go through `SendCmdMessage()`, which guards with `FWaitForCmd`:

- Non-zero → discard the new command (waiting for response)
- Zero → set `FWaitForCmd := command_byte`, call `USBSendMessage()`
- On response → `FWaitForCmd := 0` → next send unblocked

**No STOP_COMM or START_COMM is sent around individual module/cable commands.**

### set-perf-mode — triggers full USBStartInit

```delphi
procedure TG2USB.SetPerfMode(aValue: TBits1);
begin
  SendSetModeMessage(aValue);
  (Performance as TG2USBPerformance).USBStartInit(True);
end;
```

`USBStartInit` sequences via `USBInitSeq` callbacks:
1. STOP_COMM
2. GetPatchVersion
3. GetSynthSettings
4. Unknown1
5. Performance init
6. Bank list walk
7. START_COMM → `FInitialized := True`

---

## Comparison

| Aspect | CLI Daemon | Delphi |
|--------|------------|--------|
| **Drain pending** | Explicit `g2_drain_pending()` — flushes all pending USB interrupt data before/after each send | `FWaitForCmd` mutex — blocks new commands until response received; no bulk flush |
| **STOP/START per module/cable command** | YES — wraps every command | **NO** — only during init sequences |
| **set-perf-mode init** | `g2_send_init()` (lightweight patch version reset) + disarm/rearm | `USBStartInit()` (full re-init: STOP_COMM + re-fetch all state + START_COMM) |

### Summary table

| Command group | Delphi STOP/START | Delphi drain | CLI STOP/START | CLI drain |
|---|---|---|---|---|
| `set-perf-mode` | Only inside `USBStartInit()` re-init | `FWaitForCmd` guard | YES + `g2_send_init()` | drain before + after |
| `*-module` | **None** | `FWaitForCmd` guard | YES (disarm/rearm) | drain before + after |
| `*-cable-*` | **None** | `FWaitForCmd` guard | YES (disarm/rearm) | drain before + after |

---

## Implication

The CLI wraps every module/cable command with STOP_COMM + START_COMM. The Delphi app does not — it sends those commands into an active streaming session and serializes via `FWaitForCmd`. **The CLI's per-command disarm/rearm has no Delphi precedent.**

This suggests the STOP_COMM/START_COMM around module/cable commands may be overly conservative (defensive programming from early development). Worth testing whether those commands work correctly without disarm/rearm, which would simplify the daemon considerably and match Delphi's approach more closely.

---
