/*
 * G2 CLI - Watch loop
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_protocol.h"
#include "cJSON.h"

volatile int g2_watch_running = 1;
int g2_watch_verbose = 1;
void (*g2_watch_tick_hook)(void) = NULL;

void g2_watch_stop(int sig) {
    (void)sig;
    g2_watch_running = 0;
}

/* Send STOP_COMM so the G2 stops streaming and normal commands work again. */
int g2_watch_disarm(void) {
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    /* Use g2_drain_pending (not a bare recv_interrupt) so that any EXTENDED
     * interrupt arriving here has its bulk data consumed — an unread bulk
     * blocks the G2 from sending further interrupts, including the response
     * to GET_PATCH_VERSION in g2_select_variation. */
    g2_drain_pending();
    return G2_OK;
}

/* Drain stale data, send START_COMM to re-arm unsolicited notifications. */
int g2_watch_rearm(void) {
    uint8_t response[16];
    g2_drain_pending();
    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    if (send_system_data(0x41, start_cmd, 2) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    return G2_OK;
}

#define BULK_REARM 1  /* caller should re-send START_COMM */

/* Returns BULK_REARM if the G2 will stop sending after this message. */
static int process_bulk_event(const uint8_t *bulk, int bret) {
    if (bret <= 6) return 0;
    uint8_t baCmd    = bulk[1];
    uint8_t bversion = bulk[2];
    uint8_t bsubCmd  = bulk[3];
    int dataEnd      = bret - 2;

    if (baCmd == 0x04 && bversion == 0x40 && bsubCmd == 0x1f) {
        /* All-slots version update — sent as the final message of a full
         * performance switch.  The G2 stops sending after this until
         * START_COMM is re-sent. */
        printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
        fflush(stdout);
        return BULK_REARM;
    }

    if (baCmd == 0x04) {
        if (bsubCmd == 0x03) {
            /* S_SYNTH_SETTINGS — unsolicited on Patch/Performance mode switch */
            cJSON *ev = build_synth_bulk_json(bulk, "synth_settings_update");
            char *s = cJSON_PrintUnformatted(ev);
            if (s) { printf("%s\n", s); fflush(stdout); free(s); }
            int mode = strcmp(cJSON_GetObjectItem(ev, "mode")->valuestring, "Performance") == 0;
            cJSON_Delete(ev);

            /* Query perf/slot settings (skip redundant GET_SYNTH_SETTINGS) */
            cJSON *ps = query_perf_settings(mode, "perf_settings");
            if (ps) {
                char *ds = cJSON_PrintUnformatted(ps);
                if (ds) { printf("%s\n", ds); fflush(stdout); free(ds); }
                cJSON_Delete(ps);
            }
        } else if (bsubCmd == 0x29) {
            char name[17] = {0};
            int n = 0;
            for (int i = 4; i < dataEnd && n < 16 && bulk[i]; i++)
                name[n++] = (char)bulk[i];
            printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
            fflush(stdout);
        } else if (bsubCmd == 0x11) {
            printf("{\"type\":\"perf_settings\"}\n");
            fflush(stdout);
        } else {
            printf("{\"type\":\"unknown_bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
            for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
            printf("]}\n"); fflush(stdout);
        }
    } else if (baCmd <= 0x03) {
        uint8_t bslot = baCmd;
        switch (bsubCmd) {
            case 0x39:
                if (g2_watch_verbose) {
                    printf("{\"type\":\"led_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x3A:
                if (g2_watch_verbose) {
                    printf("{\"type\":\"volume_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x4D:
                printf("{\"type\":\"param_list\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x5B:
                printf("{\"type\":\"param_names\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x6F:
                printf("{\"type\":\"patch_notes\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x72:
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            default:
                printf("{\"type\":\"unknown_bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
        }
    } else {
        printf("{\"type\":\"unknown_bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
        for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
        printf("]}\n"); fflush(stdout);
    }
    return 0;
}

int g2_watch(output_format_t format, int debug) {
    uint8_t response[16] = {0};
    int ret;
    (void)format;

    if (!g2_is_connected() && g2_connect_silent() < 0) {
        fprintf(stderr, "watch: failed to connect\n");
        return G2_ERR_CONNECT;
    }

    signal(SIGINT, g2_watch_stop);
    signal(SIGTERM, g2_watch_stop);

    /* Cold-connect arm sequence — mirrors the reconnect path below exactly:
     * drain stale data, send START_COMM, read the ACK.  No clear_halt on a
     * freshly-reset G2 — issuing CLEAR_FEATURE(ENDPOINT_HALT) when no halt is
     * present puts the G2 in a state where direct queries time out, even
     * though streaming notifications still work. */
    g2_drain_pending();
    {
        uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
        if (send_system_data(0x41, start_cmd, 2) < 0) {
            fprintf(stderr, "watch: failed to send StartComm\n");
            return G2_ERR;
        }
        usleep(USB_SEND_DELAY_US);
        recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    }

    printf("{\"type\":\"watch_armed\"}\n");
    fflush(stdout);

    while (g2_watch_running) {
        if (g2_watch_tick_hook) g2_watch_tick_hook();
        ret = recv_interrupt(response, sizeof(response), 100);
        if (ret == LIBUSB_ERROR_NO_DEVICE) {
            printf("{\"type\":\"device_disconnected\"}\n");
            fflush(stdout);
            g2_disconnect();

            /* Retry immediately, then every 100 ms until cable comes back. */
            while (g2_watch_running) {
                if (g2_connect_silent() >= 0) break;
                usleep(100000);
            }
            if (!g2_watch_running) break;   /* SIGTERM during wait → clean exit */

            /* Re-arm: drain stale data, send START_COMM, recv ACK */
            g2_drain_pending();
            uint8_t start_cmd2[2] = {SUB_COMMAND_START_STOP, 0x00};
            ret = send_system_data(0x41, start_cmd2, 2);
            if (ret < 0) {
                fprintf(stderr, "watch: failed to re-arm after reconnect\n");
                break;
            }
            usleep(USB_SEND_DELAY_US);
            recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
            printf("{\"type\":\"device_reconnected\"}\n");
            fflush(stdout);
            continue;
        }
        if (ret <= 0) continue;

        if (debug) {
            printf("{\"type\":\"raw_interrupt\",\"hex\":\"");
            for (int i = 0; i < ret; i++) { if (i) printf(" "); printf("%02x", response[i]); }
            printf("\"}\n"); fflush(stdout);
        }

        uint8_t msgType = response[0] & 0x0f;

        /* Extended message: G2 has bulk data pending — drain it or it blocks notifications.
         * Bulk payload format:
         *   [0]=0x01  [1]=aCmd (0=slotA,1=B,2=C,3=D,4=perf,0x0C=sys)
         *   [2]=version  [3]=subCmd  [4..end-3]=data  [end-2..end-1]=CRC
         * LED (0x39): 1 unknown prefix byte, then 4 LEDs/byte (2-bit), FX then VA.
         * Volume (0x3A): pairs (unknown, value) per strip, FX then VA. */
        if (msgType == RESPONSE_TYPE_EXTENDED) {
            uint16_t bulkSize = ((uint16_t)response[1] << 8) | response[2];
            if (bulkSize > 0) {
                uint8_t *bulk = malloc(bulkSize);
                if (bulk) {
                    int bret = recv_bulk(bulk, bulkSize);
                    if (bret > 0) {
                        if (debug) {
                            printf("{\"type\":\"raw_bulk\",\"size\":%d,\"hex\":\"", bret);
                            for (int i = 0; i < bret; i++) { if (i) printf(" "); printf("%02x", bulk[i]); }
                            printf("\"}\n"); fflush(stdout);
                        }
                        if (process_bulk_event(bulk, bret) & BULK_REARM) {
                            /* G2 stops unsolicited data after full performance switch;
                             * re-arm it (Delphi does the same via SynthStartStopCommunication).
                             * Read the ack to keep the interrupt FIFO clean. */
                            uint8_t arm[2] = {SUB_COMMAND_START_STOP, 0x00};
                            uint8_t arm_ack[16];
                            send_system_data(0x41, arm, 2);
                            recv_interrupt(arm_ack, sizeof(arm_ack), USB_TIMEOUT_STANDARD_MS);
                        }
                    }
                    free(bulk);
                }
            }
            continue;
        }

        if (msgType != RESPONSE_TYPE_EMBEDDED) continue;

        /*
         * Embedded notification layout (Delphi BVE.NMG2USB.pas USBProcessResponseMessage
         * skips byte[0], so MemStream reads start at byte[1]):
         *   [0] = (len<<4)|2   header; len covers bytes[1..len], last 2 are CRC
         *   [1] = aR           routing byte (always 0x01)
         *   [2] = aCmd         0x00/0x08=slot A, 0x01/0x09=slot B, 0x02/0x0A=slot C,
         *                      0x03/0x0B=slot D, 0x04=perf, 0x0C=sys
         *   [3] = version      patch/perf version (or 0x40 for version-update messages)
         *   [4] = subCmd       S_SET_PARAM=0x40, R_LED=0x39, R_VOL=0x3A, etc.
         *   [5..] = data
         */
        uint8_t aCmd    = response[2];
        uint8_t version = response[3];
        uint8_t subCmd  = response[4];
        /* last data byte index = (len field) - 2 (excludes 2 CRC bytes) */
        int lastByte = (response[0] >> 4) - 2;
        if (lastByte > 15) lastByte = 15;

        /* ---- System messages (aCmd == 0x0C) ---- */
        if (aCmd == 0x0C) {
            if (version == 0x40) {
                /* Version-update messages */
                switch (subCmd) {
                    case 0x1F: /* perf + all slot versions */
                        printf("{\"type\":\"version_update\",\"perf_version\":%u}\n", response[5]);
                        break;
                    case 0x36: /* single slot/perf version */
                    case 0x38:
                        printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                               response[5], response[6]);
                        break;
                    default: {
                        char hex[32] = "";
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                            snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                        printf("{\"type\":\"unknown_sys\",\"version\":64,\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                        break;
                    }
                }
            } else {
                switch (subCmd) {
                    case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
                    case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
                    default: {
                        char hex[32] = "";
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                            snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                        printf("{\"type\":\"unknown_sys\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                        break;
                    }
                }
            }
            fflush(stdout);
            continue;
        }

        /* ---- Performance messages (aCmd == 0x04) ---- */
        if (aCmd == 0x04) {
            switch (subCmd) {
                case 0x09: /* S_SEL_SLOT */
                    printf("{\"type\":\"slot_change\",\"slot\":%u}\n", response[5]);
                    break;
                case 0x05: /* R_ASSIGNED_VOICES: 4 bytes = voices per slot */
                    printf("{\"type\":\"assigned_voices\",\"voices\":[%u,%u,%u,%u]}\n",
                           response[5], response[6], response[7], response[8]);
                    break;
                case 0x29: { /* C_PERF_NAME: null-terminated performance name */
                    char name[17] = {0};
                    int n = 0;
                    for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                        name[n++] = (char)response[i];
                    printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
                    break;
                }
                case 0x11: /* C_PERF_SETTINGS */
                case 0x10: /* Q_PERF_SETTINGS */
                    printf("{\"type\":\"perf_settings_update\"}\n");
                    break;
                case 0x3F: /* S_SET_MASTER_CLOCK: [5]=unknown [6]=type(0=run,1=bpm) [7]=value */
                    if (response[6] == 0x00)
                        printf("{\"type\":\"master_clock_run\",\"run\":%u}\n", response[7]);
                    else
                        printf("{\"type\":\"master_clock_bpm\",\"bpm\":%u}\n", response[7]);
                    break;
                case 0x5D: /* R_EXT_MASTER_CLOCK: [5]=unknown [6..7]=value */
                    printf("{\"type\":\"ext_master_clock\",\"value\":%u}\n",
                           (response[6] << 8) | response[7]);
                    break;
                case 0x80: /* R_MIDI_CC: [5]=unknown [6]=cc */
                    printf("{\"type\":\"midi_cc\",\"cc\":%u}\n", response[6]);
                    break;
                case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
                case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
                default: {
                    char hex[32] = "";
                    for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                        snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                    printf("{\"type\":\"unknown_perf\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                    break;
                }
            }
            fflush(stdout);
            continue;
        }

        /* ---- Slot messages (aCmd 0x00-0x03 or 0x08-0x0B) ---- */
        uint8_t slot = aCmd & 0x03;

        /* version=0x40 means version-update message at slot level */
        if (version == 0x40) {
            if (subCmd == 0x36 || subCmd == 0x38) /* R_PATCH_VERSION */
                printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                       response[5], response[6]);
            else {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                    snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown_version\",\"slot\":%u,\"sub\":%u,\"data\":\"%s\"}\n", slot, subCmd, hex);
            }
            fflush(stdout);
            continue;
        }

        switch (subCmd) {
            case 0x40: /* S_SET_PARAM: location(0=fx,1=va,2=patch), module, param, value, variation */
                if (response[5] == 2) {
                    printf("{\"type\":\"patch_param\",\"slot\":%u,\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[6], response[7], response[8], response[9]);
                } else {
                    printf("{\"type\":\"param_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[5] == 0 ? "fx" : "va",
                           response[6], response[7], response[8], response[9]);
                }
                break;
            case 0x43: /* S_SET_MORPH_RANGE: location, module, param, morph, value, negative, variation */
                printf("{\"type\":\"morph_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,"
                       "\"morph\":%u,\"value\":%u,\"negative\":%u,\"variation\":%u}\n",
                       slot, response[5] == 0 ? "fx" : "va",
                       response[6], response[7], response[8], response[9], response[10], response[11]);
                break;
            case 0x27: { /* S_PATCH_NAME: null-terminated patch name */
                char name[17] = {0};
                int n = 0;
                for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                    name[n++] = (char)response[i];
                printf("{\"type\":\"patch_name\",\"slot\":%u,\"name\":\"%s\"}\n", slot, name);
                break;
            }
            case 0x44: /* S_COPY_VARIATION: from, to */
                printf("{\"type\":\"copy_variation\",\"slot\":%u,\"from\":%u,\"to\":%u}\n",
                       slot, response[5], response[6]);
                break;
            case 0x6A: /* S_SEL_VARIATION */
                printf("{\"type\":\"variation_change\",\"slot\":%u,\"variation\":%u}\n",
                       slot, response[5]);
                break;
            case 0x2F: /* S_SEL_PARAM: unknown, location, module, param */
                printf("{\"type\":\"selected_param\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u}\n",
                       slot, response[6] == 0 ? "fx" : (response[6] == 1 ? "va" : "patch"),
                       response[7], response[8]);
                break;
            case 0x21: /* C_PATCH_DESCR: patch data loaded */
            case 0x3C: /* Q_PATCH: patch update complete */
                printf("{\"type\":\"patch_update\",\"slot\":%u}\n", slot);
                break;
            case 0x69: /* C_CURRENT_NOTE_2: note on/off */
                printf("{\"type\":\"current_note\",\"slot\":%u,\"note\":%u,\"velocity\":%u}\n",
                       slot, response[5], response[6]);
                break;
            case 0x72: /* R_RESOURCES_USED */
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"location\":%u}\n",
                       slot, response[5]);
                break;
            case 0x59: /* M_UNKNOWN_2 */
            case 0x70: /* M_UNKNOWN_6 */
            case 0x7F: printf("{\"type\":\"ok\",\"slot\":%u}\n", slot); break;
            case 0x7E: printf("{\"type\":\"error\",\"slot\":%u,\"code\":%u}\n", slot, response[5]); break;
            default: {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                    snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown\",\"slot\":%u,\"cmd\":%u,\"sub\":%u,\"data\":\"%s\"}\n",
                       slot, aCmd, subCmd, hex);
                break;
            }
        }
        fflush(stdout);
    }

    /* Disarm G2 so it stops streaming and subsequent commands work normally */
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    /* Flush any extended messages (with pending bulk data) that arrived before
     * STOP_COMM took effect — leaving them unread blocks subsequent commands. */
    g2_drain_pending();

    signal(SIGINT, SIG_DFL);
    signal(SIGTERM, SIG_DFL);

    return 0;
}
