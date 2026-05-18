/*
 * G2 CLI - USB event formatter
 * Formats incoming g2_msg_t messages as JSON written to stdout.
 * Extracted from g2_watch.c so daemon.c can use it without the watch loop.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_events.h"
#include "g2_protocol.h"
#include "cJSON.h"

int g2_watch_verbose = 1;

#define BULK_REARM 1

static int emit_bulk_event(const uint8_t *bulk, int bret) {
    if (bret <= 6) return 0;
    uint8_t baCmd    = bulk[1];
    uint8_t bversion = bulk[2];
    uint8_t bsubCmd  = bulk[3];
    int dataEnd      = bret - 2;

    if (baCmd == 0x04 && bversion == 0x40 && bsubCmd == 0x1f) {
        /* All-slots version update — BULK_REARM case. Listener handles re-arm;
         * daemon emits version_update directly when it receives sentinel==2.
         * This branch is dead code when listener is active, kept for completeness. */
        printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
        fflush(stdout);
        memset(g2_slot_version, 0, sizeof(g2_slot_version));
        return BULK_REARM;
    }

    if (baCmd == 0x04) {
        if (bsubCmd == 0x03) {
            cJSON *ev = build_synth_bulk_json(bulk, "synth_settings_update");
            char *s = cJSON_PrintUnformatted(ev);
            if (s) { printf("%s\n", s); fflush(stdout); free(s); }
            int mode = strcmp(cJSON_GetObjectItem(ev, "mode")->valuestring, "Performance") == 0;
            cJSON_Delete(ev);

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
    } else if (baCmd == 0x0C && bsubCmd == 0x1F) {
        /* Bulk version_update: bulk[4]=perf_version, then 4×[0x36, slot, version] */
        uint8_t perf_ver = (dataEnd > 4) ? bulk[4] : 0;
        printf("{\"type\":\"version_update\",\"perf_version\":%u,\"slot_versions\":[", perf_ver);
        int first = 1;
        for (int i = 5; i + 2 < dataEnd; i += 3) {
            if (bulk[i] != 0x36) continue;
            uint8_t slot = bulk[i + 1];
            uint8_t ver  = bulk[i + 2];
            if (slot < 4) g2_slot_version[slot] = ver;
            if (!first) printf(",");
            printf("{\"slot\":%u,\"version\":%u}", slot, ver);
            first = 0;
        }
        printf("]}\n");
        fflush(stdout);
        cJSON *synth = query_synth_settings("synth_settings_update");
        if (synth) {
            char *s = cJSON_PrintUnformatted(synth);
            if (s) { printf("%s\n", s); fflush(stdout); free(s); }
            cJSON *mode_item = cJSON_GetObjectItem(synth, "mode");
            int mode = mode_item && strcmp(mode_item->valuestring, "Performance") == 0;
            cJSON_Delete(synth);
            cJSON *ps = query_perf_settings(mode, "perf_settings");
            if (ps) {
                char *ds = cJSON_PrintUnformatted(ps);
                if (ds) { printf("%s\n", ds); fflush(stdout); free(ds); }
                cJSON_Delete(ps);
            }
        }
        g2_pending_rearm = 1;
    } else {
        printf("{\"type\":\"unknown_bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
        for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
        printf("]}\n"); fflush(stdout);
    }
    return 0;
}

static void emit_embedded_event(const uint8_t *response) {
    uint8_t aCmd    = response[2];
    uint8_t version = response[3];
    uint8_t subCmd  = response[4];
    int lastByte = (response[0] >> 4) - 2;
    if (lastByte > 15) lastByte = 15;

    if (aCmd == 0x0C) {
        if (version == 0x40) {
            switch (subCmd) {
                case 0x1F:
                    printf("{\"type\":\"version_update\",\"perf_version\":%u}\n", response[5]);
                    break;
                case 0x36:
                case 0x38:
                    printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                           response[5], response[6]);
                    if (response[5] < 4 && response[6]) g2_slot_version[response[5]] = response[6];
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
        return;
    }

    if (aCmd == 0x04) {
        switch (subCmd) {
            case 0x09:
                printf("{\"type\":\"slot_change\",\"slot\":%u}\n", response[5]);
                break;
            case 0x05:
                printf("{\"type\":\"assigned_voices\",\"voices\":[%u,%u,%u,%u]}\n",
                       response[5], response[6], response[7], response[8]);
                break;
            case 0x29: {
                char name[17] = {0};
                int n = 0;
                for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                    name[n++] = (char)response[i];
                printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
                break;
            }
            case 0x11:
            case 0x10:
                printf("{\"type\":\"perf_settings_update\"}\n");
                break;
            case 0x3F:
                if (response[6] == 0x00)
                    printf("{\"type\":\"master_clock_run\",\"run\":%u}\n", response[7]);
                else
                    printf("{\"type\":\"master_clock_bpm\",\"bpm\":%u}\n", response[7]);
                break;
            case 0x5D:
                printf("{\"type\":\"ext_master_clock\",\"value\":%u}\n",
                       (response[6] << 8) | response[7]);
                break;
            case 0x80:
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
        return;
    }

    uint8_t slot = aCmd & 0x03;

    if (version == 0x40) {
        if (subCmd == 0x36 || subCmd == 0x38) {
            printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                   response[5], response[6]);
            if (response[5] < 4 && response[6]) g2_slot_version[response[5]] = response[6];
        } else {
            char hex[32] = "";
            for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
            printf("{\"type\":\"unknown_version\",\"slot\":%u,\"sub\":%u,\"data\":\"%s\"}\n", slot, subCmd, hex);
        }
        fflush(stdout);
        return;
    }

    switch (subCmd) {
        case 0x40:
            if (response[5] == 2) {
                printf("{\"type\":\"patch_param\",\"slot\":%u,\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                       slot, response[6], response[7], response[8], response[9]);
            } else {
                printf("{\"type\":\"param_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                       slot, response[5] == 0 ? "fx" : "va",
                       response[6], response[7], response[8], response[9]);
            }
            break;
        case 0x43:
            printf("{\"type\":\"morph_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,"
                   "\"morph\":%u,\"value\":%u,\"negative\":%u,\"variation\":%u}\n",
                   slot, response[5] == 0 ? "fx" : "va",
                   response[6], response[7], response[8], response[9], response[10], response[11]);
            break;
        case 0x27: {
            char name[17] = {0};
            int n = 0;
            for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                name[n++] = (char)response[i];
            printf("{\"type\":\"patch_name\",\"slot\":%u,\"name\":\"%s\"}\n", slot, name);
            break;
        }
        case 0x44:
            printf("{\"type\":\"copy_variation\",\"slot\":%u,\"from\":%u,\"to\":%u}\n",
                   slot, response[5], response[6]);
            break;
        case 0x6A:
            printf("{\"type\":\"variation_change\",\"slot\":%u,\"variation\":%u}\n",
                   slot, response[5]);
            break;
        case 0x2F:
            printf("{\"type\":\"selected_param\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u}\n",
                   slot, response[6] == 0 ? "fx" : (response[6] == 1 ? "va" : "patch"),
                   response[7], response[8]);
            break;
        case 0x21:
        case 0x3C:
            printf("{\"type\":\"patch_update\",\"slot\":%u}\n", slot);
            break;
        case 0x69:
            printf("{\"type\":\"current_note\",\"slot\":%u,\"note\":%u,\"velocity\":%u}\n",
                   slot, response[5], response[6]);
            break;
        case 0x72:
            printf("{\"type\":\"resources_used\",\"slot\":%u,\"location\":%u}\n",
                   slot, response[5]);
            break;
        case 0x59:
        case 0x70:
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

void g2_emit_event(const g2_msg_t *msg) {
    uint8_t msgType = msg->interrupt[0] & 0x0f;
    if (msgType == RESPONSE_TYPE_EXTENDED) {
        if (msg->bulk && msg->bulk_size > 0)
            emit_bulk_event(msg->bulk, msg->bulk_size);
    } else if (msgType == RESPONSE_TYPE_EMBEDDED) {
        emit_embedded_event(msg->interrupt);
    }
}
