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
