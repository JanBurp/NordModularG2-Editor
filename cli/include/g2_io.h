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

/* Low-level USB receive helpers.
 * When g2_listener_active == 1 these route through the listener queue so that
 * device functions work correctly without conflicting with the listener thread. */
int recv_interrupt(uint8_t *response, int size, int timeout_ms);
int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries);
int recv_bulk(uint8_t *data, uint16_t size);

/* Drain all pending interrupt+bulk messages.
 * No-op when listener is active (listener drains continuously). */
int g2_drain_pending(void);

/* Re-arm G2 notification stream (send START_COMM).
 * When listener is active, the ACK is read by the listener — no recv call here. */
void g2_rearm(void);

/* Send STOP_COMM and read the embedded ACK. Call before running direct queries
 * to guarantee the G2 is not streaming (matches Delphi InitSeq step 2). */
void g2_stop_comm(void);

#endif /* G2_IO_H */
