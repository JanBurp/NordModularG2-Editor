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

/* Low-level USB framing helpers */
int send_init_msg(void);
int send_system(uint8_t cmd, uint8_t subcmd);
int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen);
int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
              const uint8_t *extra, size_t extraLen);

/* Low-level USB receive helpers */
int recv_interrupt(uint8_t *response, int size, int timeout_ms);
int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries);
int recv_bulk(uint8_t *data, uint16_t size);

/* Drain all pending interrupt+bulk messages from USB buffers */
int g2_drain_pending(void);

#endif /* G2_IO_H */
