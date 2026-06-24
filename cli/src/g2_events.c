/*
 * G2 CLI - USB event formatter
 *
 * Decodes raw g2_msg_t messages received from the listener thread and
 * writes them as JSON lines to stdout. Handles both extended (bulk) and
 * embedded (interrupt-only) message types. Shared by the watch loop and
 * the daemon main loop.
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
#include "daemon.h"

int g2_watch_verbose = 1;
static int g_events_perf_mode = 1; /* 1=Performance, 0=Patch; updated by C_SYNTH_SETTINGS bulk event */

#define BULK_REARM 1
#define SLOT_LETTER(s) ((s) < 4 ? (const char*[]){"A","B","C","D"}[(s)] : "?")

/* Emit version_update JSON from a bulk 0x1F payload.
 * update_cache=1 also writes the slot versions into g2_slot_version[]. */
static void emit_version_update_json(const uint8_t *bulk, int dataEnd, int update_cache) {
    uint8_t perf_ver = (dataEnd > 4) ? bulk[4] : 0;
    printf("{\"type\":\"version_update\",\"perf_version\":%u,\"slot_versions\":[", perf_ver);
    int first = 1;
    for (int i = 5; i + 2 < dataEnd; i += 3) {
        if (bulk[i] != 0x36) continue;
        uint8_t slot = bulk[i + 1];
        uint8_t ver  = bulk[i + 2];
        if (update_cache && slot < 4) g2_slot_version[slot] = ver;
        if (!first) printf(",");
        printf("{\"slot\":\"%s\",\"version\":%u}", SLOT_LETTER(slot), ver);
        first = 0;
    }
    printf("]}\n");
    fflush(stdout);
}

/* Handle extended (bulk) messages: synth settings, all-slots version updates,
 * and performance events. Returns BULK_REARM if the caller must re-arm streaming. */
static int emit_bulk_event(const uint8_t *bulk, int bret) {
    if (bret <= 6) return 0;
    uint8_t baCmd    = bulk[1];
    uint8_t bversion = bulk[2];
    uint8_t bsubCmd  = bulk[3];
    int dataEnd      = bret - 2;

    if (baCmd == 0x04 && bversion == 0x40 && bsubCmd == 0x1f) {
        /* All-slots version update — G2 stopped streaming (mode/slot switch).
         * Emit version data; queries (synth+patches+perf) happen in
         * rearm_with_version_update() via g2_emit_rearm_data(). */
        emit_version_update_json(bulk, dataEnd, 0);
        g2_pending_rearm = 1;
        return BULK_REARM;
    }

    if (baCmd == 0x04) {
        if (bsubCmd == 0x03) {
            cJSON *ev = build_synth_bulk_json(bulk, "synth_settings_update");
            char *s = cJSON_PrintUnformatted(ev);
            if (s) { printf("%s\n", s); fflush(stdout); free(s); }
            int mode = strcmp(cJSON_GetObjectItem(ev, "mode")->valuestring, "Performance") == 0;
            g_events_perf_mode = mode;
            cJSON_Delete(ev);

            cJSON *ps = query_perf_settings(mode, "perf_settings");
            if (ps) {
                char *ds = cJSON_PrintUnformatted(ps);
                if (ds) { printf("%s\n", ds); fflush(stdout); free(ds); }
                cJSON_Delete(ps);
            }
        } else if (bsubCmd == 0x29) {
            char name[17] = {0};
            int n = 0, i;
            for (i = 4; i < dataEnd && n < 16 && bulk[i]; i++)
                name[n++] = (char)bulk[i];
            printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
            fflush(stdout);
            int settingsStart = i + 1;
            if (settingsStart < dataEnd && bulk[settingsStart] == 0x11) {
                cJSON *root = cJSON_CreateObject();
                cJSON_AddStringToObject(root, "type", "perf_settings");
                perf_parse_and_add(bulk, (size_t)bret, g_events_perf_mode, root);
                char *s = cJSON_PrintUnformatted(root);
                if (s) { printf("%s\n", s); fflush(stdout); free(s); }
                cJSON_Delete(root);
            } else {
                printf("{\"type\":\"perf_settings_update\"}\n");
                fflush(stdout);
            }
        } else if (bsubCmd == 0x11) {
            cJSON *root = cJSON_CreateObject();
            cJSON_AddStringToObject(root, "type", "perf_settings");
            perf_parse_and_add(bulk, (size_t)bret, g_events_perf_mode, root);
            char *s = cJSON_PrintUnformatted(root);
            if (s) { printf("%s\n", s); fflush(stdout); free(s); }
            cJSON_Delete(root);
        } else {
            printf("{\"type\":\"unknown\",\"subtype\":\"bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
            for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
            printf("]}\n"); fflush(stdout);
        }
    } else if (baCmd <= 0x03) {
        uint8_t bslot = baCmd;
        switch (bsubCmd) {
            case 0x39:
                if (g2_watch_verbose) {
                    printf("{\"type\":\"led_data\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x3A:
                if (g2_watch_verbose) {
                    printf("{\"type\":\"volume_data\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x4D:
                printf("{\"type\":\"param_list\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x5B:
                printf("{\"type\":\"param_names\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x6F:
                printf("{\"type\":\"patch_notes\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x72:
                printf("{\"type\":\"resources_used\",\"slot\":\"%s\",\"data\":[", SLOT_LETTER(bslot));
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x21:
                /* Bulk C_PATCH_DESCR: hardware notifies patch description changed */
                printf("{\"type\":\"patch_version_change\",\"slot\":\"%s\",\"version\":0}\n",
                       SLOT_LETTER(bslot));
                fflush(stdout); break;
            default:
                printf("{\"type\":\"unknown\",\"subtype\":\"bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
        }
    } else if (baCmd == 0x0C && bsubCmd == 0x1F) {
        /* Bulk version_update: bulk[4]=perf_version, then 4×[0x36, slot, version].
         * G2's reply to set-perf-mode while G2 is still streaming — stop streaming
         * explicitly so queries in g2_emit_rearm_data() succeed. */
        emit_version_update_json(bulk, dataEnd, 1);
        g2_stop_comm();
        g2_pending_rearm = 1;
    } else {
        printf("{\"type\":\"unknown\",\"subtype\":\"bulk\",\"aCmd\":%u,\"version\":%u,\"sub\":%u,\"data\":[", baCmd, bversion, bsubCmd);
        for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
        printf("]}\n"); fflush(stdout);
    }
    return 0;
}

/* Handle embedded (interrupt-only) messages: param changes, slot changes,
 * variation changes, clock events, and other G2 status notifications. */
static void emit_embedded_event(const uint8_t *response) {
    uint8_t aCmd    = response[2];
    uint8_t version = response[3];
    uint8_t subCmd  = response[4];
    int lastByte = (response[0] >> 4) - 2;
    if (lastByte > 15) lastByte = 15;

    if (aCmd == 0x0C) {
        /* R_STORE (0x0D): slot/bank/location (bank+location 0-indexed from hardware).
         * R_CLEAR (0x15): type(0=patch,1=perf)/bank/location (0-indexed). */
        if (subCmd == 0x0d) {
            printf("{\"type\":\"patch_stored\",\"slot\":%u,\"bank\":%u,\"location\":%u}\n",
                   (unsigned)response[5],
                   (unsigned)(response[6] + 1),
                   (unsigned)(response[7] + 1));
            fflush(stdout);
            return;
        }
        if (subCmd == 0x15) {
            printf("{\"type\":\"patch_cleared\",\"kind\":\"%s\",\"bank\":%u,\"location\":%u}\n",
                   response[5] == 1 ? "performance" : "patch",
                   (unsigned)(response[6] + 1),
                   (unsigned)(response[7] + 1));
            fflush(stdout);
            return;
        }
        if (version == 0x40) {
            switch (subCmd) {
                case 0x1F:
                    printf("{\"type\":\"version_update\",\"perf_version\":%u}\n", response[5]);
                    break;
                case 0x36:
                case 0x38:
                    printf("{\"type\":\"patch_version\",\"slot\":\"%s\",\"version\":%u}\n",
                           SLOT_LETTER(response[5]), response[6]);
                    if (response[5] < 4 && response[6]) g2_slot_version[response[5]] = response[6];
                    break;
                default: {
                    char hex[32] = "";
                    for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                        snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                    printf("{\"type\":\"unknown\",\"subtype\":\"sys\",\"version\":64,\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
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
                    printf("{\"type\":\"unknown\",\"subtype\":\"sys\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
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
                printf("{\"type\":\"slot_change\",\"slot\":\"%s\"}\n", SLOT_LETTER(response[5]));
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
                printf("{\"type\":\"perf_settings_update\"}\n");
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
            case 0x38: {
                // R_PATCH_VERSION_CHANGE: patch description updated, slot version bumped
                uint8_t sl = response[5];
                uint8_t ver = response[6];
                if (sl < 4 && ver) g2_slot_version[sl] = ver;
                printf("{\"type\":\"patch_version_change\",\"slot\":\"%s\",\"version\":%u}\n",
                       SLOT_LETTER(sl), ver);
                break;
            }
            case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
            case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
            default: {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                    snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown\",\"subtype\":\"perf\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                break;
            }
        }
        fflush(stdout);
        return;
    }

    uint8_t slot = aCmd & 0x03;

    if (version == 0x40) {
        if (subCmd == 0x36 || subCmd == 0x38) {
            printf("{\"type\":\"patch_version\",\"slot\":\"%s\",\"version\":%u}\n",
                   SLOT_LETTER(response[5]), response[6]);
            if (response[5] < 4 && response[6]) g2_slot_version[response[5]] = response[6];
        } else {
            char hex[32] = "";
            for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
            printf("{\"type\":\"unknown\",\"subtype\":\"version\",\"slot\":\"%s\",\"sub\":%u,\"data\":\"%s\"}\n", SLOT_LETTER(slot), subCmd, hex);
        }
        fflush(stdout);
        return;
    }

    switch (subCmd) {
        case 0x40:
            if (response[5] == 2) {
                printf("{\"type\":\"patch_param\",\"slot\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                       SLOT_LETTER(slot), response[6], response[7], response[8], response[9]);
            } else {
                printf("{\"type\":\"param_change\",\"slot\":\"%s\",\"area\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                       SLOT_LETTER(slot), response[5] == 0 ? "fx" : "va",
                       response[6], response[7], response[8], response[9]);
            }
            break;
        case 0x43:
            printf("{\"type\":\"morph_change\",\"slot\":\"%s\",\"area\":\"%s\",\"module\":%u,\"param\":%u,"
                   "\"morph\":%u,\"value\":%u,\"negative\":%u,\"variation\":%u}\n",
                   SLOT_LETTER(slot), response[5] == 0 ? "fx" : "va",
                   response[6], response[7], response[8], response[9], response[10], response[11]);
            break;
        case 0x27: {
            char name[17] = {0};
            int n = 0;
            for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                name[n++] = (char)response[i];
            printf("{\"type\":\"patch_name\",\"slot\":\"%s\",\"name\":\"%s\"}\n", SLOT_LETTER(slot), name);
            break;
        }
        case 0x44:
            printf("{\"type\":\"copy_variation\",\"slot\":\"%s\",\"from\":%u,\"to\":%u}\n",
                   SLOT_LETTER(slot), response[5], response[6]);
            break;
        case 0x6A:
            printf("{\"type\":\"variation_change\",\"slot\":\"%s\",\"variation\":%u}\n",
                   SLOT_LETTER(slot), response[5]);
            break;
        case 0x2F:
            printf("{\"type\":\"selected_param\",\"slot\":\"%s\",\"area\":\"%s\",\"module\":%u,\"param\":%u}\n",
                   SLOT_LETTER(slot), response[6] == 0 ? "fx" : (response[6] == 1 ? "va" : "patch"),
                   response[7], response[8]);
            break;
        case 0x21:
        case 0x3C:
            printf("{\"type\":\"patch_update\",\"slot\":\"%s\"}\n", SLOT_LETTER(slot));
            break;
        case 0x69:
            printf("{\"type\":\"current_note\",\"slot\":\"%s\",\"note\":%u,\"velocity\":%u}\n",
                   SLOT_LETTER(slot), response[5], response[6]);
            break;
        case 0x72:
            printf("{\"type\":\"resources_used\",\"slot\":\"%s\",\"location\":%u}\n",
                   SLOT_LETTER(slot), response[5]);
            break;
        case 0x59:
        case 0x70:
        case 0x7F: printf("{\"type\":\"ok\",\"slot\":\"%s\"}\n", SLOT_LETTER(slot)); break;
        case 0x7E: printf("{\"type\":\"error\",\"slot\":\"%s\",\"code\":%u}\n", SLOT_LETTER(slot), response[5]); break;
        default: {
            char hex[32] = "";
            for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
            printf("{\"type\":\"unknown\",\"subtype\":\"slot\",\"slot\":\"%s\",\"cmd\":%u,\"sub\":%u,\"data\":\"%s\"}\n",
                   SLOT_LETTER(slot), aCmd, subCmd, hex);
            break;
        }
    }
    fflush(stdout);
}

/* Query synth settings (with patches embedded) and perf settings, emitting
 * synth_settings_update and perf_settings events. Called from daemon.c's
 * rearm_with_version_update() so all BULK_REARM paths do a full re-query. */
void g2_emit_rearm_data(void) {
    cJSON *synth = query_synth_settings("synth_settings_update");
    if (!synth) return;
    cJSON *mode_item = cJSON_GetObjectItem(synth, "mode");
    int mode = mode_item && strcmp(mode_item->valuestring, "Performance") == 0;

    /* Load all 4 slots before rearming (Delphi approach: all queries before START_COMM).
     * Embed patch data in synth_settings_update so frontend applies them directly —
     * no get-patch stdin commands are sent, eliminating the ACK race condition. */
    const char *slot_names[] = {"A", "B", "C", "D"};
    cJSON *patches = cJSON_CreateArray();
    for (int s = 0; s < 4; s++) {
        char label[32];
        snprintf(label, sizeof(label), "get_patch_%s_start", slot_names[s]);
        debug_timing(label);
        cJSON *p = g2_get_patch(slot_names[s]);
        snprintf(label, sizeof(label), "get_patch_%s_end", slot_names[s]);
        debug_timing(label);
        cJSON_AddItemToArray(patches, p ? p : cJSON_CreateNull());
    }
    cJSON_AddItemToObject(synth, "patches", patches);

    char *ss = cJSON_PrintUnformatted(synth);
    if (ss) { printf("%s\n", ss); fflush(stdout); free(ss); }
    cJSON_Delete(synth);

    cJSON *ps = query_perf_settings(mode, "perf_settings");
    if (ps) {
        char *ds = cJSON_PrintUnformatted(ps);
        if (ds) { printf("%s\n", ds); fflush(stdout); free(ds); }
        cJSON_Delete(ps);
    }
}

/* Route a received message to the appropriate emitter based on the response
 * type in the interrupt header. Extended messages carry bulk payload; embedded
 * messages are contained entirely in the 16-byte interrupt frame. */
void g2_emit_event(const g2_msg_t *msg) {
    uint8_t msgType = msg->interrupt[0] & 0x0f;
    if (msgType == RESPONSE_TYPE_EXTENDED) {
        if (msg->bulk && msg->bulk_size > 0)
            emit_bulk_event(msg->bulk, msg->bulk_size);
    } else if (msgType == RESPONSE_TYPE_EMBEDDED) {
        emit_embedded_event(msg->interrupt);
    }
}
