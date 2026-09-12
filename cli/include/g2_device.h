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
    G2_ERR_NOT_IMPLEMENTED = -14,
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

/* Set param labels: slot 0-3, location 0=fx/1=va, labels[0..num_labels-1] max 7 chars each */
int g2_set_param_label(int slot, int location, int module_id, int param_idx, int num_labels, const char **labels);

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
    int loc, int module_id, int param_idx, int num_labels, const char **labels);

/* Send multiple patch mutations as a single compound USB frame.
 * All ops must target the same slot. Version is fetched once; drain+delay happen once. */
int g2_batch_ops(int slot, const G2Op *ops, int n_ops);

/* Patch browser commands */
int g2_select_patch(int slot, int bank, int location);
int g2_select_perf(int bank, int location);
int g2_store_patch(int slot, int bank, int location);
int g2_clear_patch(int type, int bank, int location);
int g2_clear_bank(int type, int bank, int from_loc, int to_loc);
int g2_upload_patch(int slot, const char *filepath);
int g2_upload_perf(const char *filepath);
int g2_upload_patch_buf(int slot, const uint8_t *data, size_t len);
int g2_upload_perf_buf(const uint8_t *data, size_t len);

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

/* No g2_set_patch_notes(): confirmed (twice, both hanging the G2) there is no standalone live
 * SET for patch notes in the real protocol — notes only ever reach hardware embedded in a full
 * patch write (see g2_upload_patch / set-patch-description's own comment). Three independent
 * sources agree: the decompiled official editor, the Delphi reference, and chrispurusha/G2-Edit
 * (a real, hardware-tested community editor) all only ever send 0x6f as part of a full patch
 * dump/upload, never standalone. Do not reintroduce a standalone attempt. */

/* Voice mode/count: slot 0-3. These call g2_get_patch internally (read-modify-write);
 * use set-patch-description directly when an editor has the patch loaded. */
int g2_set_voice_mode(int slot, int mode);    /* monopoly: 0=poly 1=mono 2=legato 3=slgt */
int g2_set_voice_count(int slot, int count);  /* voices: 1-32 */

/* Master clock: run=0/1, bpm=30-240 */
int g2_set_master_clock_run(int run);
int g2_set_master_clock_bpm(int bpm);

/* Parameter Pages knob-assign source toggle (Patch vs Global) — the SHIFT+GLOBAL front-panel
 * combo, sub-mode 0x02 of the same 0x3F opcode as the master clock commands above; system-wide,
 * not per-slot. Confirmed against real hardware 2026-08-28 (see g2_events.c's 0x3F case). */
int g2_set_knob_source(int is_global);

/* Virtual Keyboard note on/off: note=0-127, on=0/1. System-wide, no slot — the synth routes the
 * note via its own current keyboard assignment. No velocity: the protocol doesn't carry one. */
int g2_play_note(int note, int on);

/* Param commands */
int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation);
int g2_copy_variation(int slot, int from_var, int to_var);

/* Moves the hardware panel's cursor to a param (SUB_COMMAND_SEL_PARAM, 0x2F) — the
 * outgoing half of the same message the G2 sends back when its own panel buttons move
 * the cursor (decoded as the "selected_param" watch event, see g2_events.c). */
int g2_select_param(int slot, int location, int module_id, int param_idx);

/* MIDI CC assignment commands */
int g2_assign_midicc(int slot, int location, int module_id, int param_idx, int cc_num);
int g2_deassign_midicc(int slot, int cc_num);

/* Batch MIDI CC commands — pack N sub-commands into one USB frame */
typedef struct { int location, module_id, param_idx, cc_num; } G2MidiCCEntry;
int g2_assign_midicc_batch(int slot, const G2MidiCCEntry *entries, int count);
int g2_deassign_midicc_batch(int slot, const int *cc_nums, int count);

/* Parameter Pages knob assignment (S_ASSIGN_KNOB=0x25 / S_DEASSIGN_KNOB=0x26). slot_index is the
 * knob's address 0-119. Payload layout is inferred from the Delphi reference source; both calls
 * were confirmed on real hardware (2026-08-28) to be accepted (generic embedded ACK, no error),
 * but the front panel never echoes 0x25/0x26 itself (see g2_events.c's 0x74 case), so the exact
 * field-level semantics (which byte lands on which knob) haven't been independently re-verified
 * against the decompiled CMKnobAssign::WriteStream bit layout — worth a visual spot-check. */
int g2_assign_knob(int slot, int location, int module_id, int param_idx, int slot_index);
int g2_deassign_knob(int slot, int slot_index);

/* Select the front-panel Parameter Page (S_SEL_PARAM_PAGE=0x2d, CMParameterPageFocus). page_id
 * packs both selectors into one byte: page_id = page*3 + bank, i.e. page_id/3 = Page A-E (0-4)
 * and page_id%3 = Bank 1-3 (0-2). Valid range 0-14. Confirmed against the decompiled Clavia
 * editor (G2Editor.c CMParameterPageFocus::WriteStream / G2Demo.c GetPageId). */
int g2_select_param_page(int slot, int page_id);

/* Global Parameter Pages siblings of the three functions above (S_ASS_GLOBAL_KNOB=0x1c /
 * S_DEASS_GLOB_KNOB=0x1d / S_SEL_GLOBAL_PAGE=0x1e), plus a bulk fetch (Q_GLOBAL_KNOBS=0x5e).
 * Reverse-engineered from the Delphi reference source (BVE.NMG2Mess.pas
 * AddAssignGlobalKnobMessage/AddDeassignGlobalKnobMessage/AddSelectGlobalParamPageMessage),
 * UNVERIFIED against real hardware — worth a spot-check before trusting field-level semantics.
 * `slot` is only the transport/routing slot the command rides on (any of the 4 works
 * interchangeably per the reference editor); `target_slot` (0-3, A-D) is which patch's module
 * the knob controls, encoded in the payload itself. */
int g2_assign_global_knob(int slot, int target_slot, int location, int module_id, int param_idx, int slot_index);
int g2_deassign_global_knob(int slot, int slot_index);
int g2_select_global_page(int slot, int page_id);
/* System-wide, unlike the three above — no transport slot needed (see g2_device.c). */
cJSON *g2_get_global_knobs(void);

/* Morph group assignment (S_SET_MORPH_RANGE, 0x43). A param counts as assigned to
 * morph_group purely because range != 0 — setting range to 0 deassigns it. */
int g2_set_morph_range(int slot, int location, int module_id, int param_idx,
                        int morph_group, int range, int variation);

/* Batch morph-range commands — one daemon call sends N individual WRITE_NO_RESP
 * messages (not a COMMAND_REQ compound frame; see g2_set_morph_range). */
typedef struct { int location, module_id, param_idx, morph_group, range, variation; } G2MorphEntry;
int g2_set_morph_range_batch(int slot, const G2MorphEntry *entries, int count);

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

/* Controller and Bank operations */
/* Send all MIDI Controller values to MIDI OUT for all slots */
int g2_send_controller_snapshot(void);

/* Dump patch as MIDI SYSEX - transmits complete patch in slot as SYSEX dump */
int g2_dump_patch(int slot);

/* Get bank from device - requests bank data from G2
 * type: 0 = patch (banks 1-32), 1 = performance (banks 1-8)
 * folder: destination folder for saved files
 * name: optional base name for the bank (default: PatchBankN or PerfBankN) */
int g2_get_bank(int type, int bank, const char *folder, const char *name);

/* Send bank to device - uploads bank data to G2
 * WARNING: This OVERWRITES the entire target bank!
 * type_str: "patch" or "performance"
 * source_type: "pchList" or "folder" - the source of the bank data
 * bank: target bank number (1-32 for patches, 1-8 for performances) */
int g2_send_bank(const char *type_str, const char *source_type, int bank);

#endif /* __G2_DEVICE_H__ */