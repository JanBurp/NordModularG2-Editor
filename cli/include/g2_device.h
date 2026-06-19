/*
 * G2 CLI - Device API (public header)
 *
 * High-level commands for controlling the Nord G2: connect/disconnect,
 * patch retrieval, module and cable editing, parameter control, patch
 * upload, and performance mode. All operations return G2_OK (0) on
 * success or a negative G2_ERR_* code on failure.
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
    G2_ERR_FILE_OPEN     = -11,
    G2_ERR_FILE_WRITE    = -12,
    G2_ERR_NO_MEMORY     = -13,
} g2_error_t;

/* Output format types */
typedef enum {
    OUTPUT_DEFAULT,
    OUTPUT_JSON,
} output_format_t;

/* G2 Device handle */
typedef struct {
    libusb_context *ctx;
    libusb_device_handle *handle;
    int interface_claimed;
} g2_device_t;

/* Error callback — set via g2_set_error_callback().
 * When set, errors are passed to the callback instead of printed to stderr. */
typedef void (*g2_error_cb_t)(const char *msg, void *ctx);
void g2_set_error_callback(g2_error_cb_t cb, void *ctx);

/* Batch operation descriptor: one USB sub-command with pre-built payload bytes.
 * Used by g2_batch_ops() to send multiple mutations in a single USB frame. */
typedef struct {
    uint8_t        cmd;
    const uint8_t *payload;
    int            len;
} G2Op;

/* Initialize device library */
int g2_init(void);

/* Cleanup device library */
void g2_exit(void);

/* List all USB devices (debug) */
int g2_list_devices(void);

/* List all USB devices as JSON; returns a cJSON object with "all", "g2_count", "chosen" */
cJSON *g2_list_devices_json(void);

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

/* Drain pending USB interrupt+bulk messages (no-op when listener thread is active) */
int g2_drain_pending(void);

/* Send STOP_COMM and drain until the embedded ACK — guarantees G2 is not streaming.
 * Call before direct queries that follow a command triggering streaming. */
void g2_stop_comm(void);

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
/* mode=1 → performance JSON, mode=0 → patch JSON */
cJSON *query_synth_settings(const char *type);
cJSON *query_perf_settings(int mode, const char *type);
cJSON *g2_get_patch(const char *slot_str);
cJSON *g2_get_patch_file(const char *slot_str, const char *filename);
cJSON *g2_get_perf_file(const char *filename);
cJSON *g2_get_resources(const char *slot_str); /* returns {"va":[...], "fx":[...]} */
cJSON *g2_list(int filter, int bank_filter);

/* Control commands */
int g2_select_slot(const char *slot_str);
int g2_switch_slot(const char *slot_str);
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

/* Payload builders: fill op->cmd/payload/len from typed C args into caller-supplied buf.
 * Cable builders include the output→input connector swap. Used by both single-op
 * functions (which then call send_slot) and execute_seq (which batches into one frame). */
void g2_build_del_cable_op(G2Op *op, uint8_t *buf, int loc,
    int fm, int fct, int fci, int tm, int tct, int tci);
void g2_build_add_cable_op(G2Op *op, uint8_t *buf, int loc, int color,
    int fm, int fct, int fci, int tm, int tct, int tci);
void g2_build_set_cable_color_op(G2Op *op, uint8_t *buf, int loc, int color,
    int fm, int fct, int fci, int tm, int tct, int tci);
void g2_build_del_module_op(G2Op *op, uint8_t *buf, int loc, int module_id);
void g2_build_move_module_op(G2Op *op, uint8_t *buf, int loc,
    int module_id, int col, int row);
int  g2_build_add_module_op(G2Op *op, uint8_t *buf, int loc,
    int type_id, int module_id, int col, int row, int color,
    int num_modes, const int *mode_vals, const char *name);
void g2_build_set_module_color_op(G2Op *op, uint8_t *buf,
    int loc, int module_id, int color);
void g2_build_set_module_label_op(G2Op *op, uint8_t *buf,
    int loc, int module_id, const char *label);
void g2_build_set_param_label_op(G2Op *op, uint8_t *buf,
    int loc, int module_id, int param_idx, int label_idx, const char *label);

/* Send multiple patch mutations as a single compound USB frame.
 * All ops must target the same slot. Version is fetched once; drain+delay happen once. */
int g2_batch_ops(int slot, const G2Op *ops, int n_ops);

/* Patch browser commands */
int g2_select_patch(int slot, int bank, int location);
int g2_select_perf(int bank, int location);
int g2_upload_patch(int slot, const char *filepath);
int g2_upload_perf(const char *filepath);

/* Synth settings: takes a cJSON params object matching the JSON emitted by
 * build_synth_bulk_json (synthName, midi, tuning, pedal, memProtect, etc.) */
int g2_set_synth_settings(cJSON *params);

/* Performance mode and name */
int g2_set_perf_mode(int mode);
int g2_set_perf_name(const char *name);

/* Patch name: slot 0-3, name max 16 chars */
int g2_set_patch_name(int slot, const char *name);

/* Patch description: slot 0-3, pre-encoded bitstream bytes */
int g2_set_patch_description(int slot, const uint8_t *data, int len);

/* Voice mode/count: slot 0-3. These call g2_get_patch internally (read-modify-write);
 * use set-patch-description directly when an editor has the patch loaded. */
int g2_set_voice_mode(int slot, int mode);    /* monopoly: 0=poly 1=mono 2=legato 3=slgt */
int g2_set_voice_count(int slot, int count);  /* voices: 1-32 */

/* Master clock: run=0/1, bpm=30-240 */
int g2_set_master_clock_run(int run);
int g2_set_master_clock_bpm(int bpm);

/* Param commands */
int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation);
int g2_copy_variation(int slot, int from_var, int to_var);

/* Version cache: patch version per slot (0-3 = A-D), 0 = unknown.
 * Updated by g2_get_patch, watch loop patch_version events, and g2_select_variation.
 * Invalidated on version_update all-slots event. */
extern uint8_t g2_slot_version[4];

/* Slot active/key: read-modify-write on C_PERF_SETTINGS (0x11).
 * slot_idx 0-3 (A-D), value 0 or 1. */
int g2_set_slot_enabled(int slot_idx, int value);
int g2_set_slot_key(int slot_idx, int value);
int g2_set_slot_hold(int slot_idx, int value);
int g2_set_slot_range(int slot_idx, int lower, int upper);
int g2_set_rangeEnable(int value);

#endif /* __G2_DEVICE_H__ */