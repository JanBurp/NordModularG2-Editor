/*
 * G2 CLI - Device interface
 */

#ifndef __G2_DEVICE_H__
#define __G2_DEVICE_H__

#include <stdint.h>
#include <stddef.h>
#include <libusb.h>
#include "cJSON.h"
#include "defs.h"

/* Output format types */
typedef enum {
    OUTPUT_DEFAULT,
    OUTPUT_JSON,
    OUTPUT_PRETTY,
    OUTPUT_TREE
} output_format_t;

/* G2 Device handle */
typedef struct {
    libusb_context *ctx;
    libusb_device_handle *handle;
    int interface_claimed;
} g2_device_t;

/* Initialize device library */
int g2_init(void);

/* Cleanup device library */
void g2_exit(void);

/* List all USB devices (debug) */
int g2_list_devices(void);

/* Connect to G2 (auto-detect) */
int g2_connect(void);

/* Connect silently (for JSON output mode) */
int g2_connect_silent(void);

/* Disconnect from G2 */
int g2_disconnect(void);

/* Check if connected */
int g2_is_connected(void);

/* Send/receive operations */
int g2_send_command(uint8_t *data, int length);
int g2_recv_response(uint8_t *buffer, int size, int timeout_ms);

/* Status commands */
int g2_settings(output_format_t format, int debug);
int g2_get_patch(const char *slot_str, output_format_t format);
int g2_get_patch_name(const char *slot_str, output_format_t format);

/* Control commands */
int g2_select_slot(const char *slot_str);
int g2_select_variation(int variation);

/* Utility */
slot_t parse_slot(const char *slot_str);

/* Parse synth settings and performance data into JSON */
cJSON* g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                         const uint8_t *perfData, size_t perfSize);

#endif /* __G2_DEVICE_H__ */
