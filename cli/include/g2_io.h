/*
 * G2 CLI - USB transport layer (internal header)
 * Include only within src/ — not part of the public API.
 */

#ifndef G2_IO_H
#define G2_IO_H

#include <stdint.h>
#include <stddef.h>
#include <libusb.h>
#include "g2_device.h"

/* Timing and framing constants used by all layers that build USB packets */
#define USB_SEND_DELAY_US    10000
#define COMMAND_OFFSET       2

/* The single g2 device handle — owned by g2_io.c */
extern g2_device_t g2;

/* Optional USB bus/device-address target for g2_connect()/g2_connect_silent().
 * 0/0 (the default) means "first G2 found by VID/PID" — today's behavior, used
 * by every single-device command/test. Set via g2_set_target() so a daemon can
 * pin itself to one specific physical unit when multiple G2s are attached.
 *
 * Bus/device addresses are ephemeral (the OS reassigns them on replug), so
 * there is an inherent TOCTOU between resolving a target and later opening
 * it — resolving the index (g2_set_target_by_index) and opening the target
 * (g2_open_target(), g2_io.c) are deliberately two separate enumeration
 * passes rather than one merged pass; see the comments at both call sites for
 * why collapsing them wouldn't actually close the window that matters. The
 * chosen mitigation is g2_target_last_seen below plus G2_ERR_TARGET_NOT_FOUND
 * (g2_device.h): narrow what's narrowable, make the rest loud instead of a
 * silent generic "not found". Once the target has been opened, g2_open_target()
 * also follows it to a new address on the same bus + port path (G2 self-reboot)
 * and sets g2_target_moved; see below. */
extern int g2_target_bus;
extern int g2_target_device;
void g2_set_target(int bus, int device);

/* Resolves the `index`-th attached G2 unit (0-based, same enumeration order
 * as g2_list_devices_json()'s "all" array) and calls g2_set_target() with its
 * bus/device pair. Returns 0 on success, -1 if fewer than index+1 G2 units
 * are currently attached. */
int g2_set_target_by_index(int index);

/* Set by g2_open_target() on every call where a target is set (g2_target_bus/
 * g2_target_device nonzero): 1 if a device matching that bus/device was found
 * in the enumeration list (regardless of whether libusb_open() on it then
 * succeeded), 0 if it was absent entirely. Lets a caller tell "the targeted
 * G2 was never there" apart from "it was there and vanished between
 * enumeration and open" — the TOCTOU instant actually firing. */
extern int g2_target_last_seen;

/* Set to 1 by g2_open_target() when it opened the target at a new address on the
 * same port path (g2_target_device then holds the new address). The caller clears it
 * after reporting the move (daemon: "device_retargeted" event). */
extern int g2_target_moved;

/* ── Listener message type ─────────────────────────────────────────────── */

typedef struct {
    uint8_t  interrupt[16];  /* raw 16-byte interrupt header */
    uint8_t *bulk;           /* heap-allocated bulk payload; NULL if not EXTENDED */
    uint16_t bulk_size;
    int      sentinel;       /* 1 = device disconnected; ignore interrupt/bulk */
} g2_msg_t;

/* ── Listener thread API ───────────────────────────────────────────────── */

/* 1 while listener thread is running — used by recv_interrupt/recv_bulk shims */
extern volatile int g2_listener_active;

/* Set by recv_interrupt() when it sees a sentinel=2 (BULK_REARM) while serving a
 * command handler.  The daemon main loop checks this after execute_cmd() and calls
 * g2_rearm() so that streaming is restarted even when the command handler consumed
 * the BULK_REARM message from the queue. */
extern volatile int g2_pending_rearm;

/* Set by recv_interrupt() when it sees a sentinel=1 (device disconnected) while
 * serving a command handler instead of the main loop's own queue poll.  The daemon
 * main loop checks this after execute_cmd() and calls do_reconnect() so a disconnect
 * consumed mid-command is still noticed and recovered from. */
extern volatile int g2_pending_disconnect;

/* Count of messages the listener queue evicted because it was full
 * (MSG_QUEUE_MAX). Nonzero during a request/response command means a reply may
 * have been thrown away - the cause of an unexplained "no reply" abort. */
extern volatile unsigned long g2_msg_drops;

/* Frame trace ring: g2_trace() records a sent ('>') or received ('<') frame,
 * g2_trace_dump() prints the recent ones to stderr (called on disconnect). */
void g2_trace(char dir, const uint8_t *buf, int len);
void g2_trace_dump(void);

/* Level-triggered: 1 while the G2's live stream is intentionally stopped and
 * something still owes it a rearm. Set/cleared only by g2_lock_stream()/
 * g2_unlock_stream() (and mirrored manually by callers that know the device
 * stopped itself, e.g. select-patch/upload-perf — see daemon.c). Mirrors the
 * reference editor's CSynth::CleanDirtyData lock-once/unlock-once-per-burst
 * state: everything that needs the stream stopped shares this one flag
 * instead of each caller reconstructing "are we stopped" from context. */
extern volatile int g2_stream_locked;

/* Set to 1 by daemon --debug; causes send_* functions to log hex to stdout */
extern int g2_debug;

/* Start/stop the background listener thread (sole reader of EP 0x81 / 0x82) */
int  g2_listener_start(void);
void g2_listener_stop(void);

/* Block until a message arrives (from the listener queue) or timeout (ms).
 * Returns 0 on success, -1 on timeout/stop.  Caller must call g2_msg_free(). */
int  g2_msg_recv(g2_msg_t *out, int timeout_ms);

/* Free the bulk buffer inside msg (if any).  Safe to call on zeroed msg. */
void g2_msg_free(g2_msg_t *msg);

/* ── Low-level USB framing helpers ─────────────────────────────────────── */

int send_init_msg(void);
int send_system(uint8_t cmd, uint8_t subcmd);
int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen);
int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
              const uint8_t *extra, size_t extraLen);
int send_slot_batch(uint8_t slot, uint8_t version, const G2Op *ops, int n_ops);

/* Send one complete bulk-OUT message, resuming after a short write.
 * Returns bytes sent, or -1 if the write makes no progress. */
int send_bulk_msg(const uint8_t *buff, int len);

/* Low-level USB receive helpers.
 * When g2_listener_active == 1 these route through the listener queue so that
 * device functions work correctly without conflicting with the listener thread. */
int recv_interrupt(uint8_t *response, int size, int timeout_ms);
/* Like recv_interrupt, but also returns generic ok/error acks (aCmd 0x04/0x0C, sub 0x7F/0x7E). */
int recv_interrupt_acks(uint8_t *response, int size, int timeout_ms);
int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries);
int recv_bulk(uint8_t *data, uint16_t size);
/* Reads and drops an extended message's bulk payload (direct mode; no-op with the listener running or sz 0):
 * an unread payload wedges the G2. */
void discard_bulk(uint16_t sz);

/* Drain all pending interrupt+bulk messages.
 * No-op when listener is active (listener drains continuously). */
int g2_drain_pending(void);

/* libusb error code from the last failed libusb_claim_interface() call. */
int g2_get_last_claim_error(void);

/* Re-arm G2 notification stream (send START_COMM).
 * When listener is active, the ACK is read by the listener — no recv call here. */
void g2_rearm(void);

/* Send STOP_COMM and drain whatever was already in flight. Call before running
 * direct queries to guarantee the G2 is not streaming (matches Delphi InitSeq
 * step 2). */
void g2_stop_comm(void);

/* Generic lock/unlock over g2_stop_comm()/g2_rearm(), tracked by
 * g2_stream_locked. Idempotent: g2_lock_stream() is a no-op if already
 * locked, g2_unlock_stream() a no-op if not — so any number of callers can
 * lock/unlock around a burst of operations and only the first lock and the
 * last unlock actually touch the wire. Prefer these over calling
 * g2_stop_comm()/g2_rearm() directly. */
void g2_lock_stream(void);
void g2_unlock_stream(void);

#endif /* G2_IO_H */
