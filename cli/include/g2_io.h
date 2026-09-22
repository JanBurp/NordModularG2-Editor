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
int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries);
int recv_bulk(uint8_t *data, uint16_t size);

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
