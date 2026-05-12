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

/* G2 Error codes */
typedef enum {
    G2_OK = 0,
    G2_ERR = -1,
    G2_ERR_NOT_FOUND = -2,
    G2_ERR_CONNECT = -3,
    G2_ERR_RESET = -4,
    G2_ERR_CLAIM_INTERFACE = -5,
    G2_ERR_SEND = -6,
    G2_ERR_RECV = -7,
    G2_ERR_TIMEOUT = -8,
    G2_ERR_PARSE = -9,
    G2_ERR_INVALID_PARAM = -10,
    G2_ERR_FILE_OPEN = -10,
    G2_ERR_FILE_WRITE = -11,
    G2_ERR_NO_MEMORY = -12,
} g2_error_t;

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

/* Set to 1 when running as daemon — redirects error output to JSON stdout */
extern int g2_daemon_mode;

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

/* List filter options */
#define LIST_FILTER_ALL            0
#define LIST_FILTER_PATCHES        1
#define LIST_FILTER_PERFORMANCES   2

/* Send CMD_INIT (0x80) — step 1 of the startup sequence.
 * Resets G2 patch version counters. Returns G2_OK on success. */
int g2_send_init(void);

/* Query commands - return cJSON* on success, NULL on error */
/* Caller is responsible for freeing the returned cJSON* */
cJSON *g2_startup(void);
cJSON *g2_device_info(int debug);
cJSON *g2_get_patch(const char *slot_str);
cJSON *g2_get_patch_file(const char *slot_str, const char *filename);
cJSON *g2_list(int filter, int bank_filter);

/* Control commands */
int g2_select_slot(const char *slot_str);
int g2_select_variation(int variation, int slot);

/* Cable commands: slot 0-3, location 0=fx/1=va, color 0-6,
 * con_type 0=input/1=output, con_id 0-63 */
int g2_add_cable(int slot, int location, int color,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id);
int g2_del_cable(int slot, int location,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id);
int g2_set_cable_color(int slot, int location, int color,
                       int from_mod, int from_con_type, int from_con_id,
                       int to_mod,   int to_con_type,   int to_con_id);

/* Module commands: slot 0-3, location 0=fx/1=va */
int g2_del_module(int slot, int location, int module_id);
int g2_move_module(int slot, int location, int module_id, int col, int row);
int g2_add_module(int slot, int location, int type_id, int module_id,
                  int col, int row, int color,
                  int num_modes, const int *mode_vals,
                  int num_params, const int *param_vals,
                  const char *name);

/* Set module color: slot 0-3, location 0=fx/1=va, color 0-6 */
int g2_set_module_color(int slot, int location, int module_id, int color);

/* Set module label: slot 0-3, location 0=fx/1=va, label max 16 chars */
int g2_set_module_label(int slot, int location, int module_id, const char *label);

/* Set param label: slot 0-3, location 0=fx/1=va, label_idx 0-127, label max 7 chars */
int g2_set_param_label(int slot, int location, int module_id, int param_idx, int label_idx, const char *label);

/* Set module mode: slot 0-3, location 0=fx/1=va, param index, value */
int g2_set_module_mode(int slot, int location, int module_id, int param, int val);

/* Patch browser commands */
int g2_select_patch(int slot, int bank, int location);
int g2_upload_patch(int slot, const char *filepath);

/* Param commands */
int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation);

/* Watch for param changes (simple single-threaded approach) */
int g2_watch(output_format_t format, int debug);
volatile extern int g2_watch_running;
extern int g2_watch_verbose;
extern void (*g2_watch_tick_hook)(void);
void g2_watch_stop(int sig);
int g2_watch_disarm(void);
int g2_watch_rearm(void);

#endif /* __G2_DEVICE_H__ */