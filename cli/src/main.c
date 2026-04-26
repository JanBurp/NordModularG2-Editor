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

#define PROGRAM_NAME "g2-cli"
#define PROGRAM_VERSION "1.0.0"

static void print_version(void) {
    printf("%s version %s\n", PROGRAM_NAME, PROGRAM_VERSION);
}

static void print_usage(const char *prog) {
    printf("Usage: %s [options] command [arguments]\n\n", prog);
    printf("Options:\n");
    printf("  -h, --help     Show this help\n");
    printf("  -V, --version  Show version\n");
    printf("  --json         Output as single-line JSON (default for data commands)\n");
    printf("  --pretty       Pretty-print JSON (default when outputting to terminal)\n");
    printf("  --tree         Tree view output\n");
    printf("  --debug        Show debug info (raw USB data in hex)\n");
    printf("\nCommands (implemented):\n");
    printf("  startup                              Full startup sequence (init + device + all slots + names)\n");
    printf("  connect                              Connect to G2 (auto-detect)\n");
    printf("  disconnect                           Close connection\n");
    printf("  list-devices                         List USB devices (debug)\n");
    printf("  device                               Show synth device info\n");
    printf("  get-patch <slot>                     Get patch from slot (A-D) as JSON\n");
    printf("  get-patch-file <slot> [file]         Save patch as .pch2 file\n");
    printf("  list [type] [bank <n>]               List patches and performances\n");
    printf("  slot <A|B|C|D>                      Change active slot\n");
    printf("  variation <1-8> <A-D>                Select variation for slot\n");
    printf("  add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
    printf("  del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
    printf("  watch                                Monitor param changes live\n");
    printf("\nCommands (not implemented):\n");
    printf("  * list-modules [slot]                List modules in patch\n");
    printf("  * get-param <module> <param> [var]   Get param value\n");
    printf("  * set-param <module> <param> <value> Set param value\n");
    printf("  * set-patch-json <slot> <file.json>  Upload JSON patch to slot\n");
    printf("  * set-patch-pch <slot> <file.pch2>   Upload native G2 patch\n");
    printf("  * set-patch-prf <file.prf2>          Upload performance file\n");
}

static output_format_t output_format = OUTPUT_PRETTY;
static int debug_mode = 0;

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
        } else if (strcmp(argv[i], "--pretty") == 0) {
            output_format = OUTPUT_PRETTY;
        } else if (strcmp(argv[i], "--tree") == 0) {
            output_format = OUTPUT_TREE;
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

    /* Handle commands */
    if (strcmp(command, "list-devices") == 0) {
        return g2_list_devices();
    }

    if (strcmp(command, "startup") == 0) {
        cJSON *result = g2_startup();
        if (!result) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("Startup sequence failed", output_format);
            } else {
                fprintf(stderr, "Startup sequence failed\n");
            }
            return 1;
        }
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }

    if (strcmp(command, "connect") == 0) {
        return g2_connect();
    }

    if (strcmp(command, "disconnect") == 0) {
        return g2_disconnect();
    }

    if (strcmp(command, "device") == 0) {
        cJSON *result = g2_device_info(debug_mode);
        if (!result) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("Failed to get device info", output_format);
            } else {
                fprintf(stderr, "Failed to get device info\n");
            }
            return 1;
        }
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }

    if (strcmp(command, "get-patch") == 0) {
        if (i + 1 >= argc) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("slot required (A, B, C, or D)", output_format);
            } else {
                fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
            }
            return 1;
        }
        cJSON *result = g2_get_patch(argv[i + 1]);
        if (!result) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("Failed to get patch", output_format);
            } else {
                fprintf(stderr, "Failed to get patch\n");
            }
            return 1;
        }
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }

    if (strcmp(command, "get-patch-file") == 0) {
        if (i + 1 >= argc) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("slot required (A, B, C, or D)", output_format);
            } else {
                fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
            }
            return 1;
        }
        const char *filename = (i + 2 < argc) ? argv[i + 2] : NULL;
        cJSON *result = g2_get_patch_file(argv[i + 1], filename);
        if (!result) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("Failed to get patch file", output_format);
            } else {
                fprintf(stderr, "Failed to get patch file\n");
            }
            return 1;
        }
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }

    if (strcmp(command, "list") == 0) {
        int filter = LIST_FILTER_ALL;
        int bank_filter = 0;

        /* Parse optional arguments */
        for (int j = i + 1; j < argc; j++) {
            if (strcmp(argv[j], "patches") == 0) {
                filter = LIST_FILTER_PATCHES;
            } else if (strcmp(argv[j], "performances") == 0) {
                filter = LIST_FILTER_PERFORMANCES;
            } else if (strcmp(argv[j], "bank") == 0) {
                if (j + 1 < argc) {
                    bank_filter = atoi(argv[++j]);
                    if (bank_filter < 1 || bank_filter > 32) {
                        if (output_format == OUTPUT_JSON) {
                            output_error_json("bank must be 1-32", output_format);
                        } else {
                            fprintf(stderr, "Error: bank must be 1-32\n");
                        }
                        return 1;
                    }
                }
            } else {
                if (output_format == OUTPUT_JSON) {
                    output_error_json("unknown list argument", output_format);
                } else {
                    fprintf(stderr, "Error: unknown list argument '%s'\n", argv[j]);
                }
                return 1;
            }
        }

        cJSON *result = g2_list(filter, bank_filter);
        if (!result) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("Failed to list patches", output_format);
            } else {
                fprintf(stderr, "Failed to list patches\n");
            }
            return 1;
        }
        output_json(result, output_format);
        cJSON_Delete(result);
        return 0;
    }

    if (strcmp(command, "slot") == 0) {
        if (i + 1 >= argc) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("slot required (A, B, C, or D)", output_format);
            } else {
                fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
            }
            return 1;
        }
        return g2_select_slot(argv[i + 1]);
    }

    if (strcmp(command, "variation") == 0) {
        if (i + 1 >= argc) {
            if (output_format == OUTPUT_JSON) {
                output_error_json("variation required (1-8)", output_format);
            } else {
                fprintf(stderr, "Error: variation required (1-8)\n");
            }
            return 1;
        }
        int variation = atoi(argv[i + 1]);
        int slot = -1;
        if (i + 2 < argc) {
            slot = parse_slot(argv[i + 2]);
            if (slot < 0) {
                if (output_format == OUTPUT_JSON) {
                    output_error_json("invalid slot (use A, B, C, or D)", output_format);
                } else {
                    fprintf(stderr, "Error: invalid slot (use A, B, C, or D)\n");
                }
                return 1;
            }
        }
        return g2_select_variation(variation, slot);
    }

    if (strcmp(command, "add-cable") == 0) {
        /* add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con> */
        if (i + 9 >= argc) {
            fprintf(stderr, "Usage: add-cable <slot> <va|fx> <color:0-6> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
            return 1;
        }
        int slot     = parse_slot(argv[i + 1]);
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

    if (strcmp(command, "del-cable") == 0) {
        /* del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con> */
        if (i + 8 >= argc) {
            fprintf(stderr, "Usage: del-cable <slot> <va|fx> <from-mod> <0|1> <from-con> <to-mod> <0|1> <to-con>\n");
            return 1;
        }
        int slot     = parse_slot(argv[i + 1]);
        int location = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
        int from_mod = atoi(argv[i + 3]);
        int from_ct  = atoi(argv[i + 4]);
        int from_con = atoi(argv[i + 5]);
        int to_mod   = atoi(argv[i + 6]);
        int to_ct    = atoi(argv[i + 7]);
        int to_con   = atoi(argv[i + 8]);
        return g2_del_cable(slot, location, from_mod, from_ct, from_con, to_mod, to_ct, to_con);
    }

    if (strcmp(command, "del-module") == 0) {
        /* del-module <slot> <va|fx> <module-id> */
        if (i + 3 >= argc) {
            fprintf(stderr, "Usage: del-module <slot> <va|fx> <module-id>\n");
            return 1;
        }
        int slot      = parse_slot(argv[i + 1]);
        int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
        int module_id = atoi(argv[i + 3]);
        return g2_del_module(slot, location, module_id);
    }

    if (strcmp(command, "move-module") == 0) {
        /* move-module <slot> <va|fx> <module-id> <col> <row> */
        if (i + 5 >= argc) {
            fprintf(stderr, "Usage: move-module <slot> <va|fx> <module-id> <col> <row>\n");
            return 1;
        }
        int slot      = parse_slot(argv[i + 1]);
        int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
        int module_id = atoi(argv[i + 3]);
        int col       = atoi(argv[i + 4]);
        int row       = atoi(argv[i + 5]);
        return g2_move_module(slot, location, module_id, col, row);
    }

    if (strcmp(command, "add-module") == 0) {
        /* add-module <slot> <va|fx> <type-id> <module-id> <col> <row>
         *            <num-modes> [mode-val...] <num-params> [param-val...] <name> */
        if (i + 7 >= argc) {
            fprintf(stderr, "Usage: add-module <slot> <va|fx> <type-id> <module-id> <col> <row>"
                            " <num-modes> [mode-vals...] <num-params> [param-vals...] <name>\n");
            return 1;
        }
        int slot      = parse_slot(argv[i + 1]);
        int location  = (strcmp(argv[i + 2], "va") == 0) ? 1 : 0;
        int type_id   = atoi(argv[i + 3]);
        int module_id = atoi(argv[i + 4]);
        int col       = atoi(argv[i + 5]);
        int row       = atoi(argv[i + 6]);
        int j = i + 7;

        int num_modes = (j < argc) ? atoi(argv[j++]) : 0;
        int mode_vals[64] = {0};
        for (int m = 0; m < num_modes && j < argc - 2; m++)
            mode_vals[m] = atoi(argv[j++]);

        int num_params = (j < argc) ? atoi(argv[j++]) : 0;
        int param_vals[256] = {0};
        for (int p = 0; p < num_params && j < argc - 1; p++)
            param_vals[p] = atoi(argv[j++]);

        const char *name = (j < argc) ? argv[j] : "Module";
        return g2_add_module(slot, location, type_id, module_id, col, row,
                             num_modes, mode_vals, num_params, param_vals, name);
    }

    if (strcmp(command, "watch") == 0) {
        return g2_watch(output_format, debug_mode);
    }

    if (output_format == OUTPUT_JSON) {
        output_error_json("unknown command", output_format);
    } else {
        fprintf(stderr, "Unknown command: %s\n", command);
        print_usage(argv[0]);
    }
    return 1;
}