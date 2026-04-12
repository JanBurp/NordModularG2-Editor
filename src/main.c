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
    printf("\nCommands:\n");
    printf("  connect                Connect to G2 (auto-detect)\n");
    printf("  disconnect             Close connection\n");
    printf("  list-devices          List USB devices (debug)\n");
    printf("  settings              Show synth settings\n");
    printf("  slot <A|B|C|D>        Select active slot\n");
    printf("  variation <1-8>       Select variation\n");
    printf("  get-patch [slot]      Get patch from slot (A-D, default: current)\n");
    printf("  get-patch-name [slot] Get patch name (A-D, default: current)\n");
    printf("  set-patch-json <slot> <file.json>  Upload JSON patch to slot\n");
    printf("  set-patch-pch <slot> <file.pch2>    Upload native G2 patch\n");
    printf("  set-patch-prf <file.prf2>           Upload performance file\n");
    printf("  select-slot <A|B|C|D> Change active slot\n");
    printf("  select-variation <1-8> Change variation\n");
    printf("  list-modules [slot]   List modules in patch\n");
    printf("  get-param <module> <param> [variation] Get param value\n");
    printf("  set-param <module> <param> <value> [variation] Set param value\n");
    printf("  watch                 Monitor param changes live\n");
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
        fprintf(stderr, "Failed to initialize G2 library\n");
        return 1;
    }
    
    /* Handle commands */
    if (strcmp(command, "list-devices") == 0) {
        return g2_list_devices();
    }
    
    if (strcmp(command, "connect") == 0) {
        return g2_connect();
    }
    
    if (strcmp(command, "disconnect") == 0) {
        return g2_disconnect();
    }
    
    if (strcmp(command, "settings") == 0) {
        return g2_settings(output_format, debug_mode);
    }
    
    if (strcmp(command, "get-patch") == 0) {
        const char *slot = (i + 1 < argc) ? argv[i + 1] : NULL;
        return g2_get_patch(slot, output_format);
    }
    
    if (strcmp(command, "get-patch-name") == 0) {
        const char *slot = (i + 1 < argc) ? argv[i + 1] : NULL;
        return g2_get_patch_name(slot, output_format);
    }
    
    if (strcmp(command, "slot") == 0) {
        if (i + 1 >= argc) {
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
            return 1;
        }
        return g2_select_slot(argv[i + 1]);
    }
    
    if (strcmp(command, "select-slot") == 0) {
        if (i + 1 >= argc) {
            fprintf(stderr, "Error: slot required (A, B, C, or D)\n");
            return 1;
        }
        return g2_select_slot(argv[i + 1]);
    }
    
    if (strcmp(command, "variation") == 0) {
        if (i + 1 >= argc) {
            fprintf(stderr, "Error: variation required (1-8)\n");
            return 1;
        }
        return g2_select_variation(atoi(argv[i + 1]));
    }
    
    if (strcmp(command, "select-variation") == 0) {
        if (i + 1 >= argc) {
            fprintf(stderr, "Error: variation required (1-8)\n");
            return 1;
        }
        return g2_select_variation(atoi(argv[i + 1]));
    }
    
    fprintf(stderr, "Unknown command: %s\n", command);
    print_usage(argv[0]);
    return 1;
}
