// Copyright (C) 2026 Jan den Besten
// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * G2 CLI - Command-line entry point
 *
 * Parses global flags (--json, --debug), dispatches to per-command handlers,
 * and manages output format. Each handler does one operation and returns;
 * the daemon command is the exception — it runs a persistent loop.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "defs.h"
#include "g2_device.h"
#include "output.h"
#include "utils.h"
#include "daemon.h"
#include "cJSON.h"
#include "g2_io.h"

#define PROGRAM_NAME "g2-cli"
#ifndef PROGRAM_VERSION
#define PROGRAM_VERSION "unknown"  /* set by Makefile from g2-editor/package.json */
#endif

static void print_version(void) {
    printf("%s version %s\n", PROGRAM_NAME, PROGRAM_VERSION);
}

static void print_usage(const char *prog) {
    printf("Usage: %s [options] command [arguments]\n\n", prog);
    printf("Options:\n");
    printf("  -h, --help        Show this help\n");
    printf("  -V, --version     Show version\n");
    printf("  --json            Output as single-line JSON\n");
    printf("  --debug           Show debug info (raw USB data in hex)\n");
    printf("  --device <n>      Target the n-th G2 found (0-based, see list-devices); default 0 (first found)\n");
    printf("\nCommands (implemented):\n");
    printf("  list-devices                                                                                      List USB devices (debug)\n");
    printf("  connect                                                                                           Connect to G2 (auto-detect)\n");
    printf("  disconnect                                                                                        Close connection\n");
    printf("  startup                                                                                           Full startup sequence (init + device + all slots + names)\n");
    printf("  device                                                                                            Show synth device info\n");
    printf("  get-patch <slot>                                                                                  Get patch from slot (A-D) as JSON\n");
    printf("  get-patch-file <slot> [file]                                                                      Save patch as .pch2 file\n");
    printf("  get-perf-file [file]                                                                              Save current performance as .prf2 file\n");
    printf("  select-patch <slot> <bank:1-32> <location:1-127>                                                  Load bank patch into slot\n");
    printf("  select-perf <bank:1-32> <location:1-127>                                                          Load bank performance\n");
    printf("  store-patch <slot:0-4> <bank:1-32> <location:1-127>                                               Store a slot's patch to a bank location (slot 4 = performance)\n");
    printf("  clear-patch <patch|performance> <bank:1-32> <location:1-127>                                      Clear a single bank location\n");
    printf("  upload-patch <slot> <filepath>                                                                    Upload .pch2 file to slot\n");
    printf("  upload-perf <filepath>                                                                            Upload .prf2 performance file\n");
    printf("  set-synth-settings <json>                                                                         Set all synth settings from JSON object\n");
    printf("  set-perf-mode <patch|performance> [shift]                                                         Switch between patch and performance mode (shift = SHIFT+PERF)\n");
    printf("  set-perf-name <name>                                                                              Set the current performance name\n");
    printf("  get-perf-settings                                                                                 Get current performance settings\n");
    printf("  set-patch-name <slot> <name>                                                                      Set patch name for a slot\n");
    printf("  set-patch-description <slot> <hexdata>                                                            Set patch description (hex-encoded binary)\n");
    printf("  set-master-clock-run <0|1>                                                                        Start (1) or stop (0) the master clock\n");
    printf("  set-master-clock-bpm <30-240>                                                                     Set master clock BPM\n");
    printf("  set-knob-source <0|1>                                                                             Toggle Parameter Pages knob-assign source (1=Global, 0=Patch) — SHIFT+GLOBAL\n");
    printf("  play-note <note 0-127> <0|1>                                                                      Virtual Keyboard: sound (1) or release (0) a note\n");
    printf("  list [type] [bank <n>]                                                                            List patches and performances\n");
    printf("  slot <A|B|C|D>                                                                                    Change active slot (activates if inactive)\n");
    printf("  variation <1-10> <A-D>                                                                            Select variation for slot (10 = Patch Mutator audition)\n");
    printf("  set-slot-enabled <slot> <0|1>                                                                     Enable or disable a slot\n");
    printf("  set-slot-key <slot> <0|1>                                                                         Assign or unassign keyboard to a slot\n");
    printf("  set-slot-hold <slot> <0|1>                                                                        Set slot hold mode\n");
    printf("  set-slot-range <slot> <lower:0-127> <upper:0-127>                                                 Set the keyboard range of a slot\n");
    printf("  set-range-enable <0|1>                                                                            Enable or disable slot keyboard ranges (KB Split)\n");
    printf("  add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>          Add cable between two jacks\n");
    printf("  del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>                      Delete a cable\n");
    printf("  set-cable-color <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>    Set color of an existing cable\n");
    printf("  add-module <slot> <va|fx> <type-id> <module-id> <col> <row> <color:0-6>                           Add a module to the patch\n");
    printf("  del-module <slot> <va|fx> <module-id>                                                             Delete a module (delete its cables first)\n");
    printf("  move-module <slot> <va|fx> <module-id> <col> <row>                                                Move a module to a new grid position\n");
    printf("  set-module-color <slot> <va|fx> <module-id> <color:0-24>                                          Set a module color\n");
    printf("  set-mutation-lock <slot> <va|fx> <module-id> <0|1>                                                Exclude a module from Patch Mutator changes\n");
    printf("  send-sections <slot> <hex>                                                                        Send whole patch sections ([type][len16][data]...) as one edit\n");
    printf("  set-module-uprate <slot> <va|fx> <module-id> <0|1>                                                Set a module's audio-rate (uprate) flag\n");
    printf("  set-module-name <slot> <va|fx> <module-id> <name>                                                 Set a module label\n");
    printf("  set-module-labels <slot> <va|fx|patch> <module-id> <param-idx> <count> <label>... [...]           Set ALL labelled params of a module (group repeats per param)\n");
    printf("  set-module-mode <slot> <va|fx> <module-id> <param-idx> <value>                                    Set a module mode parameter\n");
    printf("  set-param <slot> <va|fx> <module-id> <param-idx> <value> <variation>                              Set a module parameter value\n");
    printf("  set-morph-range <slot> <va|fx> <module-id> <param-idx> <range> <group> <variation>                Set a parameter's morph range (range 0 removes the assignment)\n");
    printf("  set-morph-range-batch <slot> [<va|fx> <mod> <par> <range> <group> <variation>]...                 Set multiple morph ranges in one call\n");
    printf("  select-param <slot> <va|fx|patch> <module-id> <param-idx>                                         Move the front-panel cursor to a parameter\n");
    printf("  assign-midicc <slot> <va|fx|patch> <module-id> <param-idx> <cc-num>                               Assign a MIDI CC number to a parameter\n");
    printf("  deassign-midicc <slot> <cc-num>                                                                   Remove a MIDI CC assignment\n");
    printf("  assign-midicc-batch <slot> [<va|fx|patch> <mod> <par> <cc>]...                                    Assign multiple MIDI CCs in one USB frame\n");
    printf("  deassign-midicc-batch <slot> <cc-num>...                                                          Remove multiple MIDI CC assignments in one USB frame\n");
    printf("  assign-knob <slot> <va|fx|patch> <module-id> <param-idx> <slot-index> [led]                       Assign a parameter (or, with led=1, a level meter by LED number) to a Parameter Page knob (0-119)\n");
    printf("  deassign-knob <slot> <slot-index>                                                                 Remove a Parameter Page knob assignment\n");
    printf("  select-param-page <slot> <page-id>                                                                Select the front-panel Parameter Page (page-id = page*3 + bank, 0-14)\n");
    printf("  get-param-page <slot>                                                                             Ask which Parameter Page the G2 shows (reply arrives as a param_page_change event)\n");
    printf("  assign-global-knob <slot> <target-slot> <va|fx|patch> <module-id> <param-idx> <slot-index>        Assign a parameter to a Global Parameter Page knob (0-119)\n");
    printf("  deassign-global-knob <slot> <slot-index>                                                          Remove a Global Parameter Page knob assignment\n");
    printf("  select-global-page <slot> <page-id>                                                               Select the active Global Parameter Page (page-id = page*3 + bank, 0-14)\n");
    printf("  get-global-knobs                                                                                  Fetch the Global Parameter Pages assignment list (system-wide, no slot)\n");
    printf("  copy-variation <slot> <from:0-8> <to:0-8>                                                         Copy one variation to another\n");
    printf("  get-resources <slot>                                                                              Get CPU/memory resource usage for slot (A-D)\n");
    printf("  voice-mode <slot> <0-3>                                                                           Set voice mode (0=poly 1=mono 2=legato 3=slgt) [calls get-patch, use in tmux only]\n");
    printf("  voice-count <slot> <1-32>                                                                         Set voice count [calls get-patch, use in tmux only]\n");
    printf("  send-controller-snapshot                                                                          Send all MIDI Controller values to MIDI OUT\n");
    printf("  dump-patch <slot>                                                                                 Dump patch as MIDI SYSEX (slot A-D)\n");
    printf("  get-bank <type> <bank> <folder> [<name>]                                                          Get bank from device (type: patch|performance, bank: 1-32 or 1-8)\n");
    printf("  send-bank <type> <source-type> <source-path> <bank>                                               Send bank to device (type: patch|performance, source-type: pchList|folder, bank: 1-32 or 1-8)\n");
    printf("  get-location <type> <bank> <location> <file>                                                      Read one bank location to a file (location: 1-128)\n");
    printf("  put-location <type> <bank> <location> <file> [<name>]                                             Write a file to one bank location (name defaults to the file name)\n");
    printf("  daemon [<bus> <device>]                                                                           Persistent connection: watch + accept JSON commands on stdin (optional bus/device pins one specific G2)\n");
    printf("  seq \"<cmd1>\" \"<cmd2>\" ...                                                                         Run multiple commands sequentially, sharing the USB connection\n");
}

static output_format_t output_format = OUTPUT_DEFAULT;
static int debug_mode = 0;

typedef int (*cmd_fn_t)(int argc, char **argv, int i);
typedef struct { const char *name; cmd_fn_t fn; } cmd_entry_t;

/* Forward declaration */
static int dispatch_command(int argc, char **argv, int i);

/* ---- Command handlers ---- */

static int cmd_list_devices(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    if (output_format == OUTPUT_JSON) {
        cJSON *result = g2_list_devices_json();
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }
    return g2_list_devices();
}

static int cmd_startup(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    cJSON *result = g2_startup();
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Startup sequence failed", output_format);
        else
            fprintf(stderr, "Startup sequence failed\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_connect(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    return g2_connect();
}

static int cmd_disconnect(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    return g2_disconnect();
}

static int cmd_device(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    if (g2_send_init() != G2_OK) {
        fprintf(stderr, "Failed to initialize G2\n");
        return 1;
    }
    cJSON *result = g2_device_info(debug_mode);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get device info", output_format);
        else
            fprintf(stderr, "Failed to get device info\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_get_patch(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        if (output_format == OUTPUT_JSON)
            output_error_json("slot required (A, B, C, or D)", output_format);
        else
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
        return 1;
    }
    cJSON *result = g2_get_patch(argv[i + 1]);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get patch", output_format);
        else
            fprintf(stderr, "Failed to get patch\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_get_resources(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        if (output_format == OUTPUT_JSON)
            output_error_json("slot required (A, B, C, or D)", output_format);
        else
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
        return 1;
    }
    cJSON *result = g2_get_resources(argv[i + 1]);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get resources", output_format);
        else
            fprintf(stderr, "Failed to get resources\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_voice_mode(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Error: voice-mode <slot> <0-3>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "Error: invalid slot (use A, B, C, or D)\n"); return 1; }
    return g2_set_voice_mode(slot, atoi(argv[i + 2]));
}

static int cmd_voice_count(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Error: voice-count <slot> <1-32>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "Error: invalid slot (use A, B, C, or D)\n"); return 1; }
    return g2_set_voice_count(slot, atoi(argv[i + 2]));
}

static int cmd_get_patch_file(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        if (output_format == OUTPUT_JSON)
            output_error_json("slot required (A, B, C, or D)", output_format);
        else
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
        return 1;
    }
    const char *filename = (i + 2 < argc) ? argv[i + 2] : NULL;
    cJSON *result = g2_get_patch_file(argv[i + 1], filename);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get patch file", output_format);
        else
            fprintf(stderr, "Failed to get patch file\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_get_perf_file(int argc, char **argv, int i) {
    const char *filename = (i + 1 < argc) ? argv[i + 1] : NULL;
    cJSON *result = g2_get_perf_file(filename, 0);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get performance file", output_format);
        else
            fprintf(stderr, "Failed to get performance file\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_list(int argc, char **argv, int i) {
    int filter = LIST_FILTER_ALL;
    int bank_filter = 0;

    for (int j = i + 1; j < argc; j++) {
        if (strcmp(argv[j], "patches") == 0) {
            filter = LIST_FILTER_PATCHES;
        } else if (strcmp(argv[j], "performances") == 0) {
            filter = LIST_FILTER_PERFORMANCES;
        } else if (strcmp(argv[j], "bank") == 0) {
            if (j + 1 < argc) {
                bank_filter = atoi(argv[++j]);
                if (bank_filter < 1 || bank_filter > 32) {
                    if (output_format == OUTPUT_JSON)
                        output_error_json("bank must be 1-32", output_format);
                    else
                        fprintf(stderr, "Error: bank must be 1-32\n");
                    return 1;
                }
            }
        } else {
            if (output_format == OUTPUT_JSON)
                output_error_json("unknown list argument", output_format);
            else
                fprintf(stderr, "Error: unknown list argument '%s'\n", argv[j]);
            return 1;
        }
    }

    cJSON *result = g2_list(filter, bank_filter);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to list patches", output_format);
        else
            fprintf(stderr, "Failed to list patches\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_slot(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        if (output_format == OUTPUT_JSON)
            output_error_json("slot required (A, B, C, or D)", output_format);
        else
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
        return 1;
    }
    return g2_switch_slot(argv[i + 1]);
}

static int cmd_variation(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        if (output_format == OUTPUT_JSON)
            output_error_json("variation required (1-8)", output_format);
        else
            fprintf(stderr, "Error: variation required (1-8)\n");
        return 1;
    }
    int variation = atoi(argv[i + 1]);
    int slot = -1;
    if (i + 2 < argc) {
        slot = parse_slot(argv[i + 2]);
        if (slot == SLOT_INVALID) {
            if (output_format == OUTPUT_JSON)
                output_error_json("invalid slot (use A, B, C, or D)", output_format);
            else
                fprintf(stderr, "Error: invalid slot (use A, B, C, or D)\n");
            return 1;
        }
    }
    return g2_select_variation(variation, slot);
}

static int cmd_add_cable(int argc, char **argv, int i) {
    if (i + 9 >= argc) {
        fprintf(stderr, "Usage: add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "add-cable: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int color    = atoi(argv[i + 3]);
    int from_mod = atoi(argv[i + 4]);
    int from_ct  = atoi(argv[i + 5]);
    int from_con = atoi(argv[i + 6]);
    int to_mod   = atoi(argv[i + 7]);
    int to_ct    = atoi(argv[i + 8]);
    int to_con   = atoi(argv[i + 9]);
    return g2_add_cable(slot, location, color, from_mod, from_ct, from_con, to_mod, to_ct, to_con);
}

static int cmd_del_cable(int argc, char **argv, int i) {
    if (i + 8 >= argc) {
        fprintf(stderr, "Usage: del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "del-cable: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int from_mod = atoi(argv[i + 3]);
    int from_ct  = atoi(argv[i + 4]);
    int from_con = atoi(argv[i + 5]);
    int to_mod   = atoi(argv[i + 6]);
    int to_ct    = atoi(argv[i + 7]);
    int to_con   = atoi(argv[i + 8]);
    return g2_del_cable(slot, location, from_mod, from_ct, from_con, to_mod, to_ct, to_con);
}

static int cmd_set_cable_color(int argc, char **argv, int i) {
    if (i + 9 >= argc) {
        fprintf(stderr, "Usage: set-cable-color <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-cable-color: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int color    = atoi(argv[i + 3]);
    int from_mod = atoi(argv[i + 4]);
    int from_ct  = atoi(argv[i + 5]);
    int from_con = atoi(argv[i + 6]);
    int to_mod   = atoi(argv[i + 7]);
    int to_ct    = atoi(argv[i + 8]);
    int to_con   = atoi(argv[i + 9]);
    return g2_set_cable_color(slot, location, color, from_mod, from_ct, from_con, to_mod, to_ct, to_con);
}

static int cmd_del_module(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: del-module <slot> <va|fx> <module-id>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "del-module: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    return g2_del_module(slot, location, module_id);
}

static int cmd_move_module(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: move-module <slot> <va|fx> <module-id> <col> <row>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "move-module: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    int col       = atoi(argv[i + 4]);
    int row       = atoi(argv[i + 5]);
    return g2_move_module(slot, location, module_id, col, row);
}

static int cmd_add_module(int argc, char **argv, int i) {
    if (i + 8 >= argc) {
        fprintf(stderr, "Usage: add-module <slot> <va|fx> <type-id> <module-id> <col> <row> <color>"
                        " <num-modes> [mode-vals...] <num-params> [param-vals...] <name> [muta-lock:0|1]\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "add-module: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int type_id   = atoi(argv[i + 3]);
    int module_id = atoi(argv[i + 4]);
    int col       = atoi(argv[i + 5]);
    int row       = atoi(argv[i + 6]);
    int color     = atoi(argv[i + 7]);
    int j = i + 8;

    int num_modes = (j < argc) ? atoi(argv[j++]) : 0;
    if (num_modes < 0 || num_modes > 16) { fprintf(stderr, "add-module: num-modes must be 0-16\n"); return 1; }
    int mode_vals[16] = {0};
    for (int m = 0; m < num_modes && j < argc - 2; m++)
        mode_vals[m] = atoi(argv[j++]);

    int num_params = (j < argc) ? atoi(argv[j++]) : 0;
    if (num_params < 0 || num_params > MAX_PARAMS_PER_MODULE) { fprintf(stderr, "add-module: num-params must be 0-%d\n", MAX_PARAMS_PER_MODULE); return 1; }
    int param_vals[MAX_PARAMS_PER_MODULE] = {0};
    for (int p = 0; p < num_params && j < argc - 1; p++)
        param_vals[p] = atoi(argv[j++]);

    const char *name = (j < argc) ? argv[j] : "Module";
    int muta_lock = (j + 1 < argc) ? atoi(argv[j + 1]) : 0;
    return g2_add_module(slot, location, type_id, module_id, col, row, color, muta_lock,
                         num_modes, mode_vals, num_params, param_vals, name);
}

static int cmd_set_module_color(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-module-color <slot> <va|fx> <module-id> <color:0-6>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-color: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    int color     = atoi(argv[i + 4]);
    return g2_set_module_color(slot, location, module_id, color);
}

static int cmd_send_sections(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: send-sections <slot> <hex>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "send-sections: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    uint8_t *data = NULL;
    int nbytes = hex_to_bytes(argv[i + 2], &data);
    if (nbytes <= 0) { fprintf(stderr, "send-sections: invalid hex\n"); free(data); return 1; }
    int ret = g2_send_sections(slot, data, (size_t)nbytes);
    free(data);
    return ret;
}

static int cmd_set_mutation_lock(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-mutation-lock <slot> <va|fx> <module-id> <0|1>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-mutation-lock: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    int locked    = atoi(argv[i + 4]);
    return g2_set_mutation_lock(slot, location, module_id, locked);
}

static int cmd_set_module_uprate(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-module-uprate <slot> <va|fx> <module-id> <0|1>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-uprate: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    int uprate    = atoi(argv[i + 4]);
    return g2_set_module_uprate(slot, location, module_id, uprate);
}

static int cmd_set_module_name(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-module-name <slot> <va|fx> <module-id> <name>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-name: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    return g2_set_module_label(slot, location, module_id, argv[i + 4]);
}

static int cmd_set_module_labels(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: set-module-labels <slot> <va|fx|patch> <module-id> <param-idx> <count> <label>... [<param-idx> <count> <label>...]\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-labels: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_module_labels(slot, parse_location_str(argv[i + 2]), atoi(argv[i + 3]), argc - (i + 4), (const char **)(argv + i + 4));
}

static int cmd_set_module_mode(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: set-module-mode <slot> <va|fx> <module-id> <param-idx> <value>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-mode: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = parse_location_str(argv[i + 2]);
    int module_id = atoi(argv[i + 3]);
    int param     = atoi(argv[i + 4]);
    int val       = atoi(argv[i + 5]);
    return g2_set_module_mode(slot, location, module_id, param, val);
}

static int cmd_copy_variation(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: copy-variation <slot> <from:0-8> <to:0-8>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "copy-variation: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int from_var = atoi(argv[i + 2]);
    if (from_var < 0 || from_var > 8) { fprintf(stderr, "copy-variation: from must be 0-8\n"); return 1; }
    int to_var   = atoi(argv[i + 3]);
    if (to_var < 0 || to_var > 8)     { fprintf(stderr, "copy-variation: to must be 0-8\n");   return 1; }
    return g2_copy_variation(slot, from_var, to_var);
}

static int cmd_set_param(int argc, char **argv, int i) {
    if (i + 6 >= argc) {
        fprintf(stderr, "Usage: set-param <slot> <va|fx|patch> <module-id> <param-idx> <value> <variation>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-param: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int mod_id   = atoi(argv[i + 3]);
    int param    = atoi(argv[i + 4]);
    int val      = atoi(argv[i + 5]);
    int var      = atoi(argv[i + 6]);
    return g2_set_param(slot, location, mod_id, param, val, var);
}

static int cmd_select_param(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: select-param <slot> <va|fx|patch> <module-id> <param-idx>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "select-param: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int mod_id   = atoi(argv[i + 3]);
    int param    = atoi(argv[i + 4]);
    return g2_select_param(slot, location, mod_id, param);
}

static int cmd_select_param_page(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: select-param-page <slot> <page-id>   (page-id = page*3 + bank, 0-14)\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "select-param-page: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_select_param_page(slot, atoi(argv[i + 2]));
}

static int cmd_get_param_page(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        fprintf(stderr, "Usage: get-param-page <slot>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "get-param-page: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_request_param_page(slot);
}

static int cmd_assign_midicc(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: assign-midicc <slot> <va|fx|patch> <module-id> <param-idx> <cc-num>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "assign-midicc: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int mod_id   = atoi(argv[i + 3]);
    int param    = atoi(argv[i + 4]);
    int cc_num   = atoi(argv[i + 5]);
    return g2_assign_midicc(slot, location, mod_id, param, cc_num);
}

static int cmd_deassign_midicc(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: deassign-midicc <slot> <cc-num>\n");
        return 1;
    }
    int slot   = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "deassign-midicc: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int cc_num = atoi(argv[i + 2]);
    return g2_deassign_midicc(slot, cc_num);
}

static int cmd_assign_midicc_batch(int argc, char **argv, int i) {
    int remaining = argc - i - 2;
    if (remaining < 4 || remaining % 4 != 0) {
        fprintf(stderr, "Usage: assign-midicc-batch <slot> <va|fx|patch> <module-id> <param-idx> <cc-num> [...]\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "assign-midicc-batch: invalid slot '%s'\n", argv[i + 1]); return 1; }
    int count = remaining / 4;
    G2MidiCCEntry *entries = malloc((size_t)count * sizeof(G2MidiCCEntry));
    if (!entries) return G2_ERR_NO_MEMORY;
    for (int j = 0; j < count; j++) {
        int base = i + 2 + j * 4;
        entries[j].location  = parse_location_str(argv[base]);
        entries[j].module_id = atoi(argv[base + 1]);
        entries[j].param_idx = atoi(argv[base + 2]);
        entries[j].cc_num    = atoi(argv[base + 3]);
    }
    int ret = g2_assign_midicc_batch(slot, entries, count);
    free(entries);
    return ret;
}

static int cmd_deassign_midicc_batch(int argc, char **argv, int i) {
    int count = argc - i - 2;
    if (count < 1) {
        fprintf(stderr, "Usage: deassign-midicc-batch <slot> <cc-num> [...]\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "deassign-midicc-batch: invalid slot '%s'\n", argv[i + 1]); return 1; }
    int *cc_nums = malloc((size_t)count * sizeof(int));
    if (!cc_nums) return G2_ERR_NO_MEMORY;
    for (int j = 0; j < count; j++) cc_nums[j] = atoi(argv[i + 2 + j]);
    int ret = g2_deassign_midicc_batch(slot, cc_nums, count);
    free(cc_nums);
    return ret;
}

static int cmd_assign_knob(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: assign-knob <slot> <va|fx|patch> <module-id> <param-idx> <slot-index> [led]\n");
        return 1;
    }
    int slot       = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "assign-knob: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location   = parse_location_str(argv[i + 2]);
    int mod_id     = atoi(argv[i + 3]);
    int param      = atoi(argv[i + 4]);
    int slot_index = atoi(argv[i + 5]);
    int is_led     = (i + 6 < argc && argv[i + 6][0] >= '0' && argv[i + 6][0] <= '9') ? atoi(argv[i + 6]) : 0;
    return g2_assign_knob(slot, location, mod_id, param, slot_index, is_led);
}

static int cmd_deassign_knob(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: deassign-knob <slot> <slot-index>\n");
        return 1;
    }
    int slot       = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "deassign-knob: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int slot_index = atoi(argv[i + 2]);
    return g2_deassign_knob(slot, slot_index);
}

static int cmd_select_global_page(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: select-global-page <slot> <page-id>   (page-id = page*3 + bank, 0-14)\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "select-global-page: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_select_global_page(slot, atoi(argv[i + 2]));
}

static int cmd_assign_global_knob(int argc, char **argv, int i) {
    if (i + 6 >= argc) {
        fprintf(stderr, "Usage: assign-global-knob <slot> <target-slot> <va|fx|patch> <module-id> <param-idx> <slot-index>\n");
        return 1;
    }
    int slot        = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "assign-global-knob: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int target_slot = parse_slot(argv[i + 2]);
    if (target_slot == SLOT_INVALID) { fprintf(stderr, "assign-global-knob: invalid target-slot '%s', expected A-D\n", argv[i + 2]); return 1; }
    int location   = parse_location_str(argv[i + 3]);
    int mod_id     = atoi(argv[i + 4]);
    int param      = atoi(argv[i + 5]);
    int slot_index = atoi(argv[i + 6]);
    return g2_assign_global_knob(slot, target_slot, location, mod_id, param, slot_index);
}

static int cmd_deassign_global_knob(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: deassign-global-knob <slot> <slot-index>\n");
        return 1;
    }
    int slot       = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "deassign-global-knob: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int slot_index = atoi(argv[i + 2]);
    return g2_deassign_global_knob(slot, slot_index);
}

static int cmd_get_global_knobs(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    cJSON *result = g2_get_global_knobs();
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get global knobs", output_format);
        else
            fprintf(stderr, "Failed to get global knobs\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_set_morph_range(int argc, char **argv, int i) {
    if (i + 7 >= argc) {
        fprintf(stderr, "Usage: set-morph-range <slot> <fx|va> <module-id> <param-idx> <range> <group> <variation>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-morph-range: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = parse_location_str(argv[i + 2]);
    int mod_id   = atoi(argv[i + 3]);
    int param    = atoi(argv[i + 4]);
    int range    = atoi(argv[i + 5]);
    int group    = atoi(argv[i + 6]);
    int var      = atoi(argv[i + 7]);
    return g2_set_morph_range(slot, location, mod_id, param, group, range, var);
}

static int cmd_set_morph_range_batch(int argc, char **argv, int i) {
    int remaining = argc - i - 2;
    if (remaining < 6 || remaining % 6 != 0) {
        fprintf(stderr, "Usage: set-morph-range-batch <slot> <fx|va> <module-id> <param-idx> <range> <group> <variation> [...]\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-morph-range-batch: invalid slot '%s'\n", argv[i + 1]); return 1; }
    int count = remaining / 6;
    G2MorphEntry *entries = malloc((size_t)count * sizeof(G2MorphEntry));
    if (!entries) return G2_ERR_NO_MEMORY;
    for (int j = 0; j < count; j++) {
        int base = i + 2 + j * 6;
        entries[j].location    = parse_location_str(argv[base]);
        entries[j].module_id   = atoi(argv[base + 1]);
        entries[j].param_idx   = atoi(argv[base + 2]);
        entries[j].range       = atoi(argv[base + 3]);
        entries[j].morph_group = atoi(argv[base + 4]);
        entries[j].variation   = atoi(argv[base + 5]);
    }
    int ret = g2_set_morph_range_batch(slot, entries, count);
    free(entries);
    return ret;
}

static int cmd_get_perf_settings(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    cJSON *result = g2_get_perf_settings();
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get performance settings", output_format);
        else
            fprintf(stderr, "Failed to get performance settings\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_set_patch_name(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: set-patch-name <slot> <name>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-patch-name: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_patch_name(slot, argv[i + 2]);
}

static int cmd_set_master_clock_run(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-master-clock-run <0|1>\n"); return 1; }
    return g2_set_master_clock_run(atoi(argv[i + 1]));
}

static int cmd_set_master_clock_bpm(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-master-clock-bpm <30-240>\n"); return 1; }
    return g2_set_master_clock_bpm(atoi(argv[i + 1]));
}

static int cmd_set_knob_source(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-knob-source <0|1>   (1 = Global, 0 = Patch)\n"); return 1; }
    return g2_set_knob_source(atoi(argv[i + 1]));
}

static int cmd_play_note(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: play-note <note 0-127> <0|1>\n"); return 1; }
    return g2_play_note(atoi(argv[i + 1]), atoi(argv[i + 2]));
}

static int cmd_set_slot_enabled(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: set-slot-enabled <slot> <0|1>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-slot-enabled: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_slot_enabled(slot, atoi(argv[i + 2]));
}

static int cmd_set_slot_key(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: set-slot-key <slot> <0|1>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-slot-key: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_slot_key(slot, atoi(argv[i + 2]));
}

static int cmd_set_slot_hold(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: set-slot-hold <slot> <0|1>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-slot-hold: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_slot_hold(slot, atoi(argv[i + 2]));
}

static int cmd_set_slot_range(int argc, char **argv, int i) {
    if (i + 3 >= argc) { fprintf(stderr, "Usage: set-slot-range <slot> <lower:0-127> <upper:0-127>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-slot-range: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_set_slot_range(slot, atoi(argv[i + 2]), atoi(argv[i + 3]));
}

static int cmd_set_range_enable(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-range-enable <0|1>\n"); return 1; }
    return g2_set_rangeEnable(atoi(argv[i + 1]));
}

static int cmd_set_patch_description(int argc, char **argv, int i) {
    if (i + 2 >= argc) { fprintf(stderr, "Usage: set-patch-description <slot> <hexdata>\n"); return 1; }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-patch-description: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    uint8_t *data;
    int nbytes = hex_to_bytes(argv[i + 2], &data);
    if (nbytes < 0) { fprintf(stderr, "set-patch-description: out of memory\n"); return 1; }
    int ret = g2_set_patch_description(slot, data, nbytes);
    free(data);
    return ret;
}

static int cmd_select_patch(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: select-patch <slot> <bank:1-32> <location:1-127>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "select-patch: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int bank     = atoi(argv[i + 2]);
    int location = atoi(argv[i + 3]);
    return g2_select_patch(slot, bank, location);
}

static int cmd_select_perf(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: select-perf <bank:1-32> <location:1-127>\n");
        return 1;
    }
    int bank     = atoi(argv[i + 1]);
    int location = atoi(argv[i + 2]);
    return g2_select_perf(bank, location);
}

static int cmd_store_patch(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: store-patch <slot:0-4> <bank:1-32> <location:1-127>\n");
        return 1;
    }
    int slot     = atoi(argv[i + 1]);
    int bank     = atoi(argv[i + 2]);
    int location = atoi(argv[i + 3]);
    return g2_store_patch(slot, bank, location);
}

static int cmd_clear_patch(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: clear-patch <kind:patch|performance> <bank:1-32> <location:1-127>\n");
        return 1;
    }
    int type     = (strcmp(argv[i + 1], "performance") == 0) ? 1 : 0;
    int bank     = atoi(argv[i + 2]);
    int location = atoi(argv[i + 3]);
    return g2_clear_patch(type, bank, location);
}

static int cmd_upload_patch(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: upload-patch <slot> <filepath>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "upload-patch: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_upload_patch(slot, argv[i + 2]);
}

static int cmd_upload_perf(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: upload-perf <filepath>\n"); return 1; }
    return g2_upload_perf(argv[i + 1]);
}

static int cmd_set_perf_mode(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-perf-mode <patch|performance> [shift]\n"); return 1; }
    const char *m = argv[i + 1];
    int mode = (strcmp(m, "performance") == 0) ? 1 : (strcmp(m, "patch") == 0) ? 0 : -1;
    if (mode < 0) { fprintf(stderr, "set-perf-mode: mode must be 'patch' or 'performance'\n"); return 1; }
    if (g2_send_init() != G2_OK) return 1;
    int ret = g2_set_perf_mode(mode, i + 2 < argc && strcmp(argv[i + 2], "shift") == 0);
    if (ret == G2_OK) {
        if (output_format == OUTPUT_JSON) {
            cJSON *r = cJSON_CreateObject();
            cJSON_AddBoolToObject(r, "ok", 1);
            output_json(r, output_format);
            cJSON_Delete(r);
        } else {
            fprintf(stderr, "OK\n");
        }
    }
    return ret;
}

static int cmd_set_synth_settings(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-synth-settings <json>\n"); return 1; }
    cJSON *params = cJSON_Parse(argv[i + 1]);
    if (!params) { fprintf(stderr, "set-synth-settings: invalid JSON\n"); return 1; }
    int ret = g2_set_synth_settings(params);
    cJSON_Delete(params);
    if (ret == G2_OK) {
        if (output_format == OUTPUT_JSON) {
            cJSON *r = cJSON_CreateObject();
            cJSON_AddBoolToObject(r, "ok", 1);
            output_json(r, output_format);
            cJSON_Delete(r);
        } else {
            fprintf(stderr, "OK\n");
        }
    }
    return ret;
}

static int cmd_set_perf_name(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-perf-name <name>\n"); return 1; }
    int ret = g2_set_perf_name(argv[i + 1]);
    if (ret == G2_OK) {
        if (output_format == OUTPUT_JSON) {
            cJSON *r = cJSON_CreateObject();
            cJSON_AddBoolToObject(r, "ok", 1);
            output_json(r, output_format);
            cJSON_Delete(r);
        } else {
            fprintf(stderr, "OK\n");
        }
    }
    return ret;
}

static int cmd_daemon(int argc, char **argv, int i) {
    /* Optional <bus> <device> pins this daemon to one specific physical G2 (see
     * g2_list_devices_json()'s "bus"/"device" fields) — needed when more than one
     * unit is attached, so each daemon (and its reconnect logic) only ever talks
     * to its own unit. Omitting both preserves today's "first G2 found" behavior. */
    if (i + 2 < argc) {
        int bus = atoi(argv[i + 1]);
        int device = atoi(argv[i + 2]);
        g2_set_target(bus, device);
    }
    int ret = g2_daemon_run(output_format, debug_mode);
    /* Skip atexit(g2_exit): explicit libusb_close() triggers a G2 USB
     * state change that requires re-enumeration time.  The OS reclaims
     * the handle cleanly without it. */
    _exit(ret);
}

static int cmd_send_controller_snapshot(int argc, char **argv, int i) {
    (void)argc; (void)argv; (void)i;
    return g2_send_controller_snapshot();
}

static int cmd_dump_patch(int argc, char **argv, int i) {
    if (i + 1 >= argc) {
        fprintf(stderr, "Usage: dump-patch <slot>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "dump-patch: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_dump_patch(slot);
}

static int cmd_get_bank(int argc, char **argv, int i) {
    if (i + 3 >= argc) {
        fprintf(stderr, "Usage: get-bank <type> <bank> <folder> [<name>]\n");
        return 1;
    }
    const char *type_str = argv[i + 1];
    int type = (strcmp(type_str, "performance") == 0) ? 1 : 0;
    int bank = atoi(argv[i + 2]);
    const char *folder = argv[i + 3];
    const char *name = (i + 4 < argc) ? argv[i + 4] : NULL;
    cJSON *result = g2_get_bank(type, bank, folder, name);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to get bank", output_format);
        else
            fprintf(stderr, "Failed to get bank\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_send_bank(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: send-bank <type> <source-type> <source-path> <bank>\n");
        return 1;
    }
    const char *type_str = argv[i + 1];
    const char *source_type = argv[i + 2];
    const char *source_path = argv[i + 3];
    int bank = atoi(argv[i + 4]);
    cJSON *result = g2_send_bank(type_str, source_type, source_path, bank);
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json("Failed to send bank", output_format);
        else
            fprintf(stderr, "Failed to send bank\n");
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int output_location_result(cJSON *result, const char *what) {
    if (!result) {
        if (output_format == OUTPUT_JSON)
            output_error_json(what, output_format);
        else
            fprintf(stderr, "%s\n", what);
        return 1;
    }
    output_json(result, output_format);
    cJSON_Delete(result);
    return 0;
}

static int cmd_get_location(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: get-location <type> <bank> <location> <file>\n");
        return 1;
    }
    int type = (strcmp(argv[i + 1], "performance") == 0) ? 1 : 0;
    return output_location_result(g2_get_location(type, atoi(argv[i + 2]), atoi(argv[i + 3]), argv[i + 4]),
                                  "Failed to get location");
}

static int cmd_put_location(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: put-location <type> <bank> <location> <file> [<name>]\n");
        return 1;
    }
    int type = (strcmp(argv[i + 1], "performance") == 0) ? 1 : 0;
    const char *name = (i + 5 < argc) ? argv[i + 5] : NULL;
    return output_location_result(g2_put_location(type, atoi(argv[i + 2]), atoi(argv[i + 3]), argv[i + 4], name),
                                  "Failed to put location");
}

static int cmd_seq(int argc, char **argv, int i) {
    for (int j = i + 1; j < argc; j++) {
        char buf[1024];
        strncpy(buf, argv[j], sizeof(buf) - 1);
        buf[sizeof(buf) - 1] = '\0';
        char *sub_argv[64];
        int sub_argc = tokenize_command(buf, sub_argv, 64);
        if (sub_argc == 0) continue;
        int ret = dispatch_command(sub_argc, sub_argv, 0);
        if (ret != 0) return ret;
    }
    return 0;
}

/* ---- Dispatch table ---- */

static const cmd_entry_t commands[] = {
    { "list-devices",     cmd_list_devices     },
    { "startup",          cmd_startup          },
    { "connect",          cmd_connect          },
    { "disconnect",       cmd_disconnect       },
    { "device",           cmd_device           },
    { "get-patch",        cmd_get_patch        },
    { "get-patch-file",   cmd_get_patch_file   },
    { "get-perf-file",    cmd_get_perf_file    },
    { "get-resources",    cmd_get_resources    },
    { "voice-mode",       cmd_voice_mode       },
    { "voice-count",      cmd_voice_count      },
    { "list",             cmd_list             },
    { "slot",             cmd_slot             },
    { "variation",        cmd_variation        },
    { "add-cable",        cmd_add_cable        },
    { "del-cable",        cmd_del_cable        },
    { "set-cable-color",  cmd_set_cable_color  },
    { "del-module",       cmd_del_module       },
    { "move-module",      cmd_move_module      },
    { "add-module",       cmd_add_module       },
    { "set-module-color", cmd_set_module_color },
    { "set-mutation-lock", cmd_set_mutation_lock },
    { "send-sections",    cmd_send_sections    },
    { "set-module-uprate", cmd_set_module_uprate },
    { "set-module-name",  cmd_set_module_name  },
    { "assign-midicc",         cmd_assign_midicc         },
    { "deassign-midicc",       cmd_deassign_midicc       },
    { "assign-midicc-batch",   cmd_assign_midicc_batch   },
    { "deassign-midicc-batch", cmd_deassign_midicc_batch },
    { "assign-knob",           cmd_assign_knob           },
    { "deassign-knob",         cmd_deassign_knob         },
    { "assign-global-knob",    cmd_assign_global_knob    },
    { "deassign-global-knob",  cmd_deassign_global_knob  },
    { "select-global-page",    cmd_select_global_page    },
    { "get-global-knobs",      cmd_get_global_knobs      },
    { "set-morph-range",       cmd_set_morph_range       },
    { "set-morph-range-batch", cmd_set_morph_range_batch },
    { "set-module-labels", cmd_set_module_labels },
    { "set-module-mode",  cmd_set_module_mode  },
    { "set-param",        cmd_set_param        },
    { "select-param",     cmd_select_param     },
    { "select-param-page", cmd_select_param_page },
    { "get-param-page",   cmd_get_param_page   },
    { "copy-variation",   cmd_copy_variation   },
    { "select-patch",     cmd_select_patch     },
    { "select-perf",      cmd_select_perf      },
    { "store-patch",      cmd_store_patch      },
    { "clear-patch",      cmd_clear_patch      },
    { "upload-patch",     cmd_upload_patch     },
    { "upload-perf",      cmd_upload_perf      },
    { "set-synth-settings",    cmd_set_synth_settings    },
    { "set-perf-mode",         cmd_set_perf_mode         },
    { "set-perf-name",         cmd_set_perf_name         },
    { "get-perf-settings",     cmd_get_perf_settings     },
    { "set-patch-name",        cmd_set_patch_name        },
    { "set-patch-description", cmd_set_patch_description },
    { "set-master-clock-run",  cmd_set_master_clock_run  },
    { "set-master-clock-bpm",  cmd_set_master_clock_bpm  },
    { "set-knob-source",       cmd_set_knob_source       },
    { "play-note",             cmd_play_note             },
    { "set-slot-enabled",      cmd_set_slot_enabled      },
    { "set-slot-key",          cmd_set_slot_key          },
    { "set-slot-hold",         cmd_set_slot_hold         },
    { "set-slot-range",        cmd_set_slot_range        },
    { "set-range-enable",      cmd_set_range_enable      },
    { "daemon",                cmd_daemon                },
    { "send-controller-snapshot", cmd_send_controller_snapshot },
    { "dump-patch",        cmd_dump_patch        },
    { "get-bank",          cmd_get_bank          },
    { "send-bank",        cmd_send_bank        },
    { "get-location",     cmd_get_location     },
    { "put-location",     cmd_put_location     },
    { "seq",              cmd_seq              },
    { NULL, NULL }
};

static int dispatch_command(int argc, char **argv, int i) {
    const char *command = argv[i];
    for (int j = 0; commands[j].name; j++) {
        if (strcmp(command, commands[j].name) == 0)
            return commands[j].fn(argc, argv, i);
    }
    if (output_format == OUTPUT_JSON)
        output_error_json("unknown command", output_format);
    else {
        fprintf(stderr, "Unknown command: %s\n", command);
        print_usage(argv[0]);
    }
    return 1;
}

int main(int argc, char *argv[]) {
    int i;
    const char *command = NULL;
    int device_index = -1;

    /* Parse global options */
    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        }
        if (strcmp(argv[i], "-V") == 0 || strcmp(argv[i], "--version") == 0) {
            print_version();
            return 0;
        }
        if (strcmp(argv[i], "--debug") == 0) {
            debug_mode = 1;
            g2_debug = 1;
        } else if (strcmp(argv[i], "--json") == 0) {
            output_format = OUTPUT_JSON;
        } else if (strcmp(argv[i], "--device") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "--device requires a value\n");
                return 1;
            }
            device_index = atoi(argv[++i]);
        } else if (argv[i][0] != '-') {
            command = argv[i];
            break;
        }
    }

    if (command == NULL) {
        print_usage(argv[0]);
        return 1;
    }

    /* Initialize G2 library */
    if (g2_init() < 0) {
        if (output_format == OUTPUT_JSON) {
            output_error_json("Failed to initialize G2 library", output_format);
        } else {
            fprintf(stderr, "Failed to initialize G2 library\n");
        }
        return 1;
    }
    atexit(g2_exit);

    if (device_index >= 0 && g2_set_target_by_index(device_index) != 0) {
        if (output_format == OUTPUT_JSON) {
            output_error_json("No G2 device found at index", output_format);
        } else {
            fprintf(stderr, "No G2 device found at index %d\n", device_index);
        }
        return 1;
    }

    return dispatch_command(argc, argv, i);
}
