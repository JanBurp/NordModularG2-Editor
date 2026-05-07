/*
 * G2 CLI - Internal USB layer API
 * Used only by g2_device.c and g2_usb.c — not part of the public interface.
 */

#ifndef __G2_USB_INTERNAL_H__
#define __G2_USB_INTERNAL_H__

#include <stdint.h>
#include <stddef.h>

#define USB_TIMEOUT_STANDARD   100
#define USB_TIMEOUT_LONG      2000
#define USB_SEND_DELAY_US    10000
#define COMMAND_OFFSET           2

void g2_err(const char *fmt, ...);
int  ensure_connected(int silent);
int  send_system(uint8_t cmd, uint8_t subcmd);
int  send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen);
int  send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
               const uint8_t *extra, size_t extraLen);
int  recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries);
int  recv_interrupt(uint8_t *response, int size, int timeout_ms);
int  recv_bulk(uint8_t *data, uint16_t size);
int  g2_drain_pending(void);
void g2_clear_halts(void);

#endif /* __G2_USB_INTERNAL_H__ */
