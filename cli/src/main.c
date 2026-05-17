/*
 * G2 CLI - Main entry point
 * CLI tool for Nord G2 synthesizer
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

#define PROGRAM_NAME "g2-cli"
#define PROGRAM_VERSION "1.0.0"

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
    printf("\nCommands (implemented):\n");
    printf("  list-devices                                                                              List USB devices (debug)\n");
    printf("  connect                                                                                   Connect to G2 (auto-detect)\n");
    printf("  disconnect                                                                                Close connection\n");
    printf("  startup                                                                                   Full startup sequence (init + device + all slots + names)\n");
    printf("  device                                                                                    Show synth device info\n");
    printf("  get-patch <slot>                                                                          Get patch from slot (A-D) as JSON\n");
    printf("  get-patch-file <slot> [file]                                                              Save patch as .pch2 file\n");
    printf("  select-patch <slot> <bank:1-32> <location:1-127>                                          Load bank patch into slot\n");
    printf("  upload-patch <slot> <filepath>                                                            Upload .pch2 file to slot\n");
    printf("  set-perf-mode <patch|performance>                                                         Switch between patch and performance mode\n");
    printf("  set-perf-name <name>                                                                      Set the current performance name\n");
    printf("  list [type] [bank <n>]                                                                    List patches and performances\n");
    printf("  slot <A|B|C|D>                                                                            Change active slot\n");
    printf("  variation <1-8> <A-D>                                                                     Select variation for slot\n");
    printf("  add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>  Add cable between two jacks\n");
    printf("  del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>              Delete a cable\n");
    printf("  set-cable-color <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>  Set color of an existing cable\n");
    printf("  add-module <slot> <va|fx> <type-id> <module-id> <col> <row> <color:0-6>                   Add a module to the patch\n");
    printf("  del-module <slot> <va|fx> <module-id>                                                     Delete a module (delete its cables first)\n");
    printf("  move-module <slot> <va|fx> <module-id> <col> <row>                                        Move a module to a new grid position\n");
    printf("  set-module-color <slot> <va|fx> <module-id> <color:0-24>                                  Set a module color\n");
    printf("  set-module-name <slot> <va|fx> <module-id> <name>                                         Set a module label\n");
    printf("  set-param-label <slot> <va|fx> <module-id> <param-idx> <label-idx> <label>                Set a parameter label\n");
    printf("  set-module-mode <slot> <va|fx> <module-id> <param-idx> <value>                            Set a module mode parameter\n");
    printf("  set-param <slot> <va|fx> <module-id> <param-idx> <value> <variation>                      Set a module parameter value\n");
    printf("  daemon                                                                                    Persistent connection: watch + accept JSON commands on stdin\n");
    printf("  seq \"<cmd1>\" \"<cmd2>\" ...                                                                 Run multiple commands sequentially, sharing the USB connection\n");
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
    return g2_select_slot(argv[i + 1]);
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
    int location = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
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
    int location = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
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
    int location = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
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
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
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
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int module_id = atoi(argv[i + 3]);
    int col       = atoi(argv[i + 4]);
    int row       = atoi(argv[i + 5]);
    return g2_move_module(slot, location, module_id, col, row);
}

static int cmd_add_module(int argc, char **argv, int i) {
    if (i + 8 >= argc) {
        fprintf(stderr, "Usage: add-module <slot> <va|fx> <type-id> <module-id> <col> <row> <color>"
                        " <num-modes> [mode-vals...] <num-params> [param-vals...] <name>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "add-module: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
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
    return g2_add_module(slot, location, type_id, module_id, col, row, color,
                         num_modes, mode_vals, num_params, param_vals, name);
}

static int cmd_set_module_color(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-module-color <slot> <va|fx> <module-id> <color:0-6>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-color: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int module_id = atoi(argv[i + 3]);
    int color     = atoi(argv[i + 4]);
    return g2_set_module_color(slot, location, module_id, color);
}

static int cmd_set_module_name(int argc, char **argv, int i) {
    if (i + 4 >= argc) {
        fprintf(stderr, "Usage: set-module-name <slot> <va|fx> <module-id> <name>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-name: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int module_id = atoi(argv[i + 3]);
    return g2_set_module_label(slot, location, module_id, argv[i + 4]);
}

static int cmd_set_param_label(int argc, char **argv, int i) {
    if (i + 6 >= argc) {
        fprintf(stderr, "Usage: set-param-label <slot> <va|fx> <module-id> <param-idx> <label-idx> <label>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-param-label: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int module_id = atoi(argv[i + 3]);
    int param_idx = atoi(argv[i + 4]);
    int label_idx = atoi(argv[i + 5]);
    return g2_set_param_label(slot, location, module_id, param_idx, label_idx, argv[i + 6]);
}

static int cmd_set_module_mode(int argc, char **argv, int i) {
    if (i + 5 >= argc) {
        fprintf(stderr, "Usage: set-module-mode <slot> <va|fx> <module-id> <param-idx> <value>\n");
        return 1;
    }
    int slot      = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-module-mode: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int module_id = atoi(argv[i + 3]);
    int param     = atoi(argv[i + 4]);
    int val       = atoi(argv[i + 5]);
    return g2_set_module_mode(slot, location, module_id, param, val);
}

static int cmd_set_param(int argc, char **argv, int i) {
    if (i + 6 >= argc) {
        fprintf(stderr, "Usage: set-param <slot> <va|fx> <module-id> <param-idx> <value> <variation>\n");
        return 1;
    }
    int slot     = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "set-param: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    int location = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
    int mod_id   = atoi(argv[i + 3]);
    int param    = atoi(argv[i + 4]);
    int val      = atoi(argv[i + 5]);
    int var      = atoi(argv[i + 6]);
    return g2_set_param(slot, location, mod_id, param, val, var);
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

static int cmd_upload_patch(int argc, char **argv, int i) {
    if (i + 2 >= argc) {
        fprintf(stderr, "Usage: upload-patch <slot> <filepath>\n");
        return 1;
    }
    int slot = parse_slot(argv[i + 1]);
    if (slot == SLOT_INVALID) { fprintf(stderr, "upload-patch: invalid slot '%s', expected A-D\n", argv[i + 1]); return 1; }
    return g2_upload_patch(slot, argv[i + 2]);
}

static int cmd_set_perf_mode(int argc, char **argv, int i) {
    if (i + 1 >= argc) { fprintf(stderr, "Usage: set-perf-mode <patch|performance>\n"); return 1; }
    const char *m = argv[i + 1];
    int mode = (strcmp(m, "performance") == 0) ? 1 : (strcmp(m, "patch") == 0) ? 0 : -1;
    if (mode < 0) { fprintf(stderr, "set-perf-mode: mode must be 'patch' or 'performance'\n"); return 1; }
    if (g2_send_init() != G2_OK) return 1;
    int ret = g2_set_perf_mode(mode);
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
    (void)argc; (void)argv; (void)i;
    int ret = g2_daemon_run(output_format);
    /* Skip atexit(g2_exit): explicit libusb_close() triggers a G2 USB
     * state change that requires re-enumeration time.  The OS reclaims
     * the handle cleanly without it. */
    _exit(ret);
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
    { "set-module-name",  cmd_set_module_name  },
    { "set-param-label",  cmd_set_param_label  },
    { "set-module-mode",  cmd_set_module_mode  },
    { "set-param",        cmd_set_param        },
    { "select-patch",     cmd_select_patch     },
    { "upload-patch",     cmd_upload_patch     },
    { "set-perf-mode",    cmd_set_perf_mode    },
    { "set-perf-name",    cmd_set_perf_name    },
    { "daemon",           cmd_daemon           },
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
        } else if (strcmp(argv[i], "--json") == 0) {
            output_format = OUTPUT_JSON;
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

    return dispatch_command(argc, argv, i);
}
