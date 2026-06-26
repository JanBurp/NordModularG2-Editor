/*
 * G2 CLI - Device API
 *
 * High-level commands for the Nord G2: connect/disconnect, patch retrieval,
 * module and cable editing, parameter control, patch upload, and performance
 * mode. Builds on the low-level transport in g2_io.c.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <unistd.h>
#include <libusb.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_protocol.h"
#include "utils.h"
#include "cJSON.h"
#include "daemon.h"
#include "g2_events.h"

static g2_error_cb_t g2_error_cb = NULL;
static void *g2_error_cb_ctx = NULL;

/* Patch version cache per slot (0-3 = A-D), 0 = unknown */
uint8_t g2_slot_version[4] = {0};

void g2_set_error_callback(g2_error_cb_t cb, void *ctx) {
    g2_error_cb = cb;
    g2_error_cb_ctx = ctx;
}

static void g2_err(const char *fmt, ...) {
    char msg[256];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);
    size_t len = strlen(msg);
    if (len > 0 && msg[len - 1] == '\n') msg[--len] = '\0';
    if (g2_error_cb) {
        g2_error_cb(msg, g2_error_cb_ctx);
    } else {
        fprintf(stderr, "%s\n", msg);
    }
}
static int ensure_connected(int silent) {
    if (g2_is_connected()) {
        return 0;
    }
    return silent ? g2_connect_silent() : g2_connect();
}

int g2_send_init(void) {
    uint8_t response[16] = {0};

    if (ensure_connected(1) < 0) return G2_ERR_CONNECT;

    /* Send CMD_INIT without draining first. Draining with a finite timeout
     * loops forever when the G2 is streaming (~17 ms intervals). CMD_INIT
     * itself stops streaming; stale events are consumed in the read loop. */
    if (send_init_msg() < 0) {
        g2_err("Failed to send init message\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    /* Read responses until RESPONSE_TYPE_INIT is found. Streaming events
     * may arrive before the init response if the G2 was streaming. */
    for (int tries = 0; tries < 10; tries++) {
        int ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) {
            g2_err("No response to init message\n");
            return G2_ERR_RECV;
        }

        if ((response[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) continue;

        uint16_t size = ((uint16_t)response[1] << 8) | response[2];
        if (size == 0) continue;

        uint8_t *data = malloc(size);
        if (!data) return G2_ERR_NO_MEMORY;
        recv_bulk(data, size);
        uint8_t first = data[0];
        free(data);

        if (first == RESPONSE_TYPE_INIT) return G2_OK;
        /* else: stale streaming bulk — discard and keep reading */
    }

    g2_err("Did not receive init response after retries\n");
    return G2_ERR_RECV;
}

cJSON *query_synth_settings(const char *type) {
    uint8_t intr[16] = {0}, bulk[512] = {0};
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) return NULL;
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(intr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (intr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return NULL;
    uint16_t size = ((uint16_t)intr[1] << 8) | intr[2];
    if (size == 0 || size > sizeof(bulk)) return NULL;
    if (recv_bulk(bulk, size) <= 0) return NULL;
    return build_synth_bulk_json(bulk, type);
}

cJSON *query_perf_settings(int mode, const char *type) {
    uint8_t selsData[1024] = {0}, selsInterrupt[16] = {0};
    uint8_t perfData[1024] = {0}, perfInterrupt[16] = {0};
    size_t perfSize = 0;
    int ret;
    uint16_t size;

    /* The G2 tags this reply baCmd==0x04 in steady state, but baCmd==0x0C while
     * finalizing a mode/perf switch (see g2_events.c's aCmd==0x0C handling) — both
     * are genuine, perf_parse_and_add()-compatible payloads; byte[2] (perf_version)
     * is in the same place either way, so no validation is needed here. */
    if (send_system(0x41, 0x81) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    /* This reply's payload (name + settings) is only valid when bsubCmd is 0x11
     * (steady state) or 0x29 (sent while finalizing a mode/perf switch, baCmd may
     * be 0x04 or 0x0C either way) — both shapes perf_parse_and_add() understands.
     * Anything else (e.g. the 0x81 selections-shaped reply above, mis-ordered)
     * is a stray message: relay it via g2_emit_event() so it isn't lost, then
     * keep waiting instead of treating it as our answer. */
    if (send_system(selsData[2], 0x10) == 0) {
        usleep(USB_SEND_DELAY_US);
        for (int attempt = 0; attempt < 5; attempt++) {
            ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
            if (ret <= 0 || (perfInterrupt[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) break;
            size = (perfInterrupt[1] << 8) | perfInterrupt[2];
            if (size < 4 || size > sizeof(perfData)) break;
            recv_bulk(perfData, size);
            if (perfData[3] == 0x11 || perfData[3] == 0x29) { perfSize = size; break; }
            g2_msg_t relay = {0};
            memcpy(relay.interrupt, perfInterrupt, 16);
            relay.bulk = perfData;
            relay.bulk_size = size;
            g2_emit_event(&relay);
        }
    }

    cJSON *root = cJSON_CreateObject();
    if (type) cJSON_AddStringToObject(root, "type", type);
    perf_parse_and_add(perfData, perfSize, mode, root);
    return root;
}

cJSON *g2_device_info(int debug) {
    uint8_t response[8192] = {0};
    uint8_t *bulkData = NULL;
    uint8_t *perfData = NULL;
    size_t bulkSize = 0;
    size_t perfSize = 0;
    int ret;
    uint8_t msgType;
    uint16_t size;
    cJSON *root = NULL;

    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        goto cleanup;
    }

    /* Flush stale data before querying (direct mode only; same pattern as g2_get_patch).
     * Avoids g2_drain_pending() which can accidentally call g2_rearm() and start
     * streaming without a listener, contaminating subsequent query responses. */
    if (!g2_listener_active) {
        uint8_t stale[16]; int n;
        while ((n = recv_interrupt(stale, sizeof(stale), USB_TIMEOUT_STALE_MS)) > 0) {
            if ((stale[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t sz = ((uint16_t)stale[1] << 8) | stale[2];
                if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
            }
        }
    }

    /* Step 1: Send GET_SYNTH_SETTINGS (0x02) */
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        g2_err("Failed to send synth settings command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) {
        g2_err("No response from G2\n");
        goto cleanup;
    }

    msgType = response[0] & 0x0f;
    if (msgType != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type %d\n", msgType);
        goto cleanup;
    }

    size = (response[1] << 8) | response[2];
    if (size == 0 || size > EXTENDED_MESSAGE_SIZE) {
        g2_err("Unexpected synth settings size: %u\n", size);
        goto cleanup;
    }
    bulkData = malloc(size);
    if (!bulkData) {
        g2_err("Memory allocation failed\n");
        goto cleanup;
    }
    bulkSize = size;

    if (recv_bulk(bulkData, size) <= 0) {
        g2_err("Failed to read bulk data\n");
        goto cleanup;
    }

    if (debug) {
        fprintf(stderr, "SYNTH:%zu:", bulkSize);
        for (size_t j = 0; j < bulkSize; j++) {
            fprintf(stderr, "%02x", bulkData[j]);
        }
        fprintf(stderr, "\n");
    }

    /* Step 2: Get performance data with 0x81 and 0x10 commands */
    uint8_t selsData[1024] = {0};
    uint8_t selsInterrupt[16] = {0};

    if (send_system(0x41, 0x81) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD_MS);

        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    perfData = malloc(1024);
    if (!perfData) {
        g2_err("Memory allocation failed\n");
        goto cleanup;
    }

    uint8_t perfInterrupt[16] = {0};
    if (send_system(selsData[2], 0x10) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_STANDARD_MS);

        if (ret > 0 && (perfInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (perfInterrupt[1] << 8) | perfInterrupt[2];
            perfSize = size;
            recv_bulk(perfData, size);
        }
    }

    if (debug) {
        fprintf(stderr, "PERF:%zu:", perfSize);
        for (size_t j = 0; j < perfSize; j++) {
            fprintf(stderr, "%02x", perfData[j]);
        }
        fprintf(stderr, "\n");
    }

    /* Parse settings data and build JSON */
    root = g2_parse_settings(bulkData, bulkSize, perfData, perfSize);
    if (!root) {
        g2_err("Failed to parse settings\n");
    }

cleanup:
    free(bulkData);
    free(perfData);
    return root;
}

cJSON *g2_get_patch(const char *slot_str) {
    int slot;
    int actual_slot;
    uint8_t version;
    uint8_t interruptResp[16] = {0};
    uint8_t *patchData = NULL;
    uint16_t patchSize = 0;
    int ret;

    if (ensure_connected(1) < 0) {
            g2_err("Failed to connect to G2\n");
            return NULL;
        }

    /* Parse slot parameter - required */
    if (slot_str == NULL) {
        g2_err("Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    actual_slot = slot;

    /* Flush stale G2 data from a previous command (direct mode only;
     * listener thread drains EP 0x81 continuously, so no flush needed). */
    if (!g2_listener_active) {
        uint8_t stale[16]; int n;
        while ((n = recv_interrupt(stale, sizeof(stale), USB_TIMEOUT_STALE_MS)) > 0) {
            if ((stale[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t sz = ((uint16_t)stale[1] << 8) | stale[2];
                if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
            }
        }
    }

    /* Step 1: Get version for the slot */
    /* Send: [CMD_SYS, 0x41, 0x35, slot] */
    debug_timing("get_patch_version_start");
    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        g2_err("Failed to send get patch version command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    debug_timing("get_patch_version_end");
    if (ret <= 0) {
        g2_err("No response from G2 for patch version\n");
        goto cleanup;
    }
    /* Embedded response format: [length][data...][CRC]
     * The version byte sits at index 6 of the raw 16-byte interrupt response. */
    version = interruptResp[6];
    if (version && actual_slot < 4) g2_slot_version[actual_slot] = version;

    /* Step 2: Get patch data with version */
    debug_timing("get_patch_slot_start");
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        g2_err("Failed to send get patch command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) {
        g2_err("No interrupt response for patch data\n");
        goto cleanup;
    }
    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    if (patchSize == 0) {
        g2_err("Received empty patch data\n");
        goto cleanup;
    }
    patchData = malloc(patchSize);
    if (!patchData) {
        g2_err("Memory allocation failed\n");
        goto cleanup;
    }

    ret = recv_bulk(patchData, patchSize);
    debug_timing("get_patch_slot_end");
    if (ret <= 0) {
        g2_err("Failed to read patch bulk data\n");
        free(patchData);
        patchData = NULL;
        goto cleanup;
    }

    /* Step 3: Get patch name */
    debug_timing("get_patch_name_start");
    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        free(patchData);
        goto cleanup;
    }

    usleep(100000);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_LONG_MS);
    debug_timing("get_patch_name_end");

    if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
        parse_name(interruptResp + 5, patchName, sizeof(patchName));
    } else if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t size = (interruptResp[1] << 8) | interruptResp[2];
        uint8_t *nameData = malloc(size);
        if (nameData) {
            int bulkLen = recv_bulk(nameData, size);
            if (bulkLen > 4) {
                parse_name(nameData + 4, patchName, sizeof(patchName));
            }
            free(nameData);
        }
    }

    /* Convert USB bulk format to pch2 format before returning */
    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (pch2Data && patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) == 0) {
        free(patchData);
        patchData = pch2Data;
        patchSize = (uint16_t)pch2Size;
    } else {
        free(pch2Data);
    }

    /* Build JSON output */
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "slot", (char*[]){ "A", "B", "C", "D" }[slot]);
    cJSON_AddStringToObject(root, "name", patchName);
    cJSON_AddNumberToObject(root, "size", patchSize);

    char *hexStr = malloc(patchSize * 2 + 1);
    if (hexStr) {
        for (size_t i = 0; i < patchSize; i++) {
            sprintf(hexStr + i * 2, "%02x", patchData[i]);
        }
        hexStr[patchSize * 2] = '\0';
        cJSON_AddStringToObject(root, "data", hexStr);
        free(hexStr);
    }

    free(patchData);
    return root;

cleanup:
    free(patchData);
    return NULL;
}

cJSON *g2_get_patch_file(const char *slot_str, const char *filename) {
    int slot;
    int actual_slot;
    uint8_t version;
    uint8_t interruptResp[16] = {0};
    uint8_t *patchData = NULL;
    uint16_t patchSize = 0;
    int ret;
    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        return NULL;
    }

    if (slot_str == NULL) {
        g2_err("Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    actual_slot = slot;

    g2_err("Fetching patch from slot %c...\n", "ABCD"[slot]);

    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        g2_err("Failed to send get patch version command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) {
        g2_err("No response from G2 for patch version\n");
        goto cleanup;
    }
    version = interruptResp[6];
    if (version && actual_slot < 4) g2_slot_version[actual_slot] = version;

    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        g2_err("Failed to send get patch command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) {
        g2_err("No interrupt response for patch data\n");
        goto cleanup;
    }

    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    patchData = malloc(patchSize);
    if (!patchData) {
        g2_err("Memory allocation failed\n");
        goto cleanup;
    }

    ret = recv_bulk(patchData, patchSize);
    if (ret <= 0) {
        g2_err("Failed to read patch bulk data\n");
        goto cleanup;
    }

    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        goto cleanup;
    }

    usleep(100000);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_LONG_MS);
    if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
        parse_name(interruptResp + 5, patchName, sizeof(patchName));
    } else if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t size = (interruptResp[1] << 8) | interruptResp[2];
        uint8_t *nameData = malloc(size);
        if (nameData) {
            int bulkLen = recv_bulk(nameData, size);
            if (bulkLen > 4) {
                parse_name(nameData + 4, patchName, sizeof(patchName));
            }
            free(nameData);
        }
    }

    char defaultFilename[64];
    if (filename == NULL) {
        if (strlen(patchName) == 0) {
            snprintf(defaultFilename, sizeof(defaultFilename), "slot_%c.pch2", "ABCD"[slot]);
        } else {
            snprintf(defaultFilename, sizeof(defaultFilename), "%s.pch2", patchName);
        }
        filename = defaultFilename;
    }

    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (!pch2Data) {
        g2_err("Memory allocation failed for PCH2 conversion\n");
        goto cleanup;
    }

    if (patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) < 0) {
        g2_err("Failed to convert patch to PCH2 format\n");
        free(pch2Data);
        goto cleanup;
    }

    FILE *f = fopen(filename, "wb");
    if (!f) {
        g2_err("Failed to open file '%s' for writing\n", filename);
        free(pch2Data);
        goto cleanup;
    }

    size_t written = fwrite(pch2Data, 1, pch2Size, f);
    fclose(f);
    free(pch2Data);

    if (written != pch2Size) {
        g2_err("Failed to write complete file\n");
        goto cleanup;
    }

    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "file", filename);
    cJSON_AddStringToObject(result, "slot", (char*[]){ "A", "B", "C", "D" }[slot]);
    cJSON_AddStringToObject(result, "name", patchName);
    cJSON_AddNumberToObject(result, "size", (int)pch2Size);

    free(patchData);
    return result;

cleanup:
    free(patchData);
    return NULL;
}

cJSON *g2_startup(void) {
    if (ensure_connected(1) < 0) return NULL;

    cJSON *device = g2_device_info(0);
    if (!device) return NULL;

    const char *slotNames[] = {"A", "B", "C", "D"};
    cJSON *slots = cJSON_CreateArray();
    for (int i = 0; i < 4; i++) {
        cJSON *patch = g2_get_patch(slotNames[i]);
        cJSON_AddItemToArray(slots, patch ? patch : cJSON_CreateNull());
    }

    cJSON *names = g2_list(LIST_FILTER_ALL, 0);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddItemToObject(root, "device", device);
    cJSON_AddItemToObject(root, "slots", slots);
    cJSON_AddItemToObject(root, "names", names ? names : cJSON_CreateNull());
    return root;
}

int g2_select_slot(const char *slot_str) {
    int slot;
    uint8_t version;
    uint8_t data[2] = {0};

    if (ensure_connected(0) < 0) {
        g2_err("Failed to connect to G2\n");
        return G2_ERR_CONNECT;
    }

    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        return G2_ERR_INVALID_PARAM;
    }

    g2_drain_pending();

    /* SELECT_SLOT uses the performance version (slot=4), not the patch slot version.
     * Per doc/usb.md §6: SELECT_SLOT is a performance-level command.
     * Send only sub-cmd 0x09 (Delphi PerfSelectSlot). The g2ctl.py 0x07 bitmask
     * step resets all slots' active/key state as a side effect and must not be used. */
    {
        uint8_t pv_cmd[2] = {SUB_COMMAND_GET_PATCH_VERSION, 4};
        uint8_t pv_resp[16] = {0};
        send_system_data(0x41, pv_cmd, 2);
        usleep(USB_SEND_DELAY_US);
        int pv_ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD_MS);
        version = (pv_ret > 0 && pv_resp[6]) ? pv_resp[6] : 0x41;
    }

    data[0] = 0x09;
    data[1] = slot;
    if (send_system_data(version, data, 2) < 0) {
        g2_err("Failed to send slot select command\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();

    return G2_OK;
}

/* G2 patch category names, indices 0-15 */
static const char* g2categories[16] = {
    "no_cat",   /* 0: no_cat */
    "acoustic", /* 1: acoustic */
    "sequencer",/* 2: sequencer */
    "bass",     /* 3: bass */
    "classic",  /* 4: classic */
    "drum",     /* 5: drum */
    "fantasy",  /* 6: fantasy */
    "fx",       /* 7: fx */
    "lead",     /* 8: lead */
    "organ",    /* 9: organ */
    "pad",      /* 10: pad */
    "piano",    /* 11: piano */
    "synth",    /* 12: synth */
    "audio_in", /* 13: audio_in */
    "user_1",   /* 14: user_1 */
    "user_2"    /* 15: user_2 */
};

/* List command control codes */
#define LIST_JUMP      1
#define LIST_SKIP      2
#define LIST_BANK      3
#define LIST_MODE      4
#define LIST_CONTINUE  5
#define LIST_LAST      LIST_CONTINUE

cJSON *g2_list(int filter, int bank_filter) {
    uint8_t response[1024] = {0};
    uint8_t cmdData[4] = {0};
    cJSON *root = NULL;
    cJSON *result = NULL;
    int ret;
    int mode;
    int bank = 0;
    int patch = 0;
    int PATCH_MODE = 0;
    int PERFORMANCE_MODE = 1;
    int END_MODE = 2;
    int start_mode, end_mode;
    int done = 0;
    int bank_filter_active = (bank_filter > 0);
    int initial_bank = bank_filter > 0 ? bank_filter - 1 : 0;

    if (ensure_connected(1) < 0) {
            g2_err("Not connected to G2\n");
            return NULL;
        }

    if (filter == LIST_FILTER_ALL) {
        root = cJSON_CreateObject();
        cJSON *patches = cJSON_CreateObject();
        cJSON *performances = cJSON_CreateObject();
        cJSON_AddItemToObject(root, "patches", patches);
        cJSON_AddItemToObject(root, "performances", performances);
        result = root;
    } else {
        result = cJSON_CreateObject();
        root = result;
    }

    if (filter == LIST_FILTER_ALL) {
        start_mode = PATCH_MODE;
        end_mode = END_MODE;
    } else if (filter == LIST_FILTER_PATCHES) {
        start_mode = PATCH_MODE;
        end_mode = PATCH_MODE + 1;
    } else {
        start_mode = PERFORMANCE_MODE;
        end_mode = PERFORMANCE_MODE + 1;
    }

    for (mode = start_mode; mode < end_mode && !done; mode++) {
        bank = initial_bank;
        patch = 0;

        while (mode < END_MODE && !done) {
            cmdData[0] = 0x14;
            cmdData[1] = (uint8_t)mode;
            cmdData[2] = (uint8_t)bank;
            cmdData[3] = (uint8_t)patch;

            if (send_system_data(0x41, cmdData, 4) < 0) {
                g2_err("Failed to send list command\n");
                if (root) cJSON_Delete(root);
                return NULL;
            }

            ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
            if (ret <= 0) {
                ret = recv_bulk(response, sizeof(response));
            }

            if (ret <= 9) {
                break;
            }

            int data_len = ret - 9 - 2;
            if (data_len <= 0) {
                break;
            }

            uint8_t *data = response + 9;
            int pos = 0;

            while (pos < data_len) {
                uint8_t c = data[pos];

                if (c > LIST_LAST) {
                    char name[32] = {0};
                    int nameLen = parse_name(data + pos, name, sizeof(name));

                        int extra = (mode == PATCH_MODE) ? 1 : 0; /* patches have category byte, perfs don't */
                    if (nameLen <= 0 || pos + nameLen + extra > data_len) {
                        break;
                    }

                    cJSON *item = cJSON_CreateObject();
                    cJSON_AddNumberToObject(item, "location", patch + 1);
                    cJSON_AddStringToObject(item, "name", name);

                    if (mode == PATCH_MODE) {
                        int categoryIdx = data[pos + nameLen];
                        if (categoryIdx > 15) categoryIdx = 0;
                        cJSON_AddStringToObject(item, "category", g2categories[categoryIdx]);
                    }

                    char bankKey[8];
                    snprintf(bankKey, sizeof(bankKey), "%d", bank + 1);
                    cJSON *bankArray;

                    if (filter == LIST_FILTER_ALL) {
                        if (mode == PATCH_MODE) {
                            bankArray = cJSON_GetObjectItem(cJSON_GetObjectItem(root, "patches"), bankKey);
                            if (!bankArray) {
                                bankArray = cJSON_CreateArray();
                                cJSON_AddItemToObject(cJSON_GetObjectItem(root, "patches"), bankKey, bankArray);
                            }
                        } else {
                            bankArray = cJSON_GetObjectItem(cJSON_GetObjectItem(root, "performances"), bankKey);
                            if (!bankArray) {
                                bankArray = cJSON_CreateArray();
                                cJSON_AddItemToObject(cJSON_GetObjectItem(root, "performances"), bankKey, bankArray);
                            }
                        }
                    } else {
                        bankArray = cJSON_GetObjectItem(result, bankKey);
                        if (!bankArray) {
                            bankArray = cJSON_CreateArray();
                            cJSON_AddItemToObject(result, bankKey, bankArray);
                        }
                    }

                    cJSON_AddItemToArray(bankArray, item);

                    patch++;
                    pos += nameLen + extra;
                } else if (c == LIST_CONTINUE) {
                    pos++;
                } else if (c == LIST_BANK) {
                    if (pos + 3 <= data_len) {
                        int new_bank = data[pos + 1];
                        patch = data[pos + 2];

                        if (bank_filter_active && new_bank != bank) {
                            done = 1;
                            break;
                        }

                        bank = new_bank;
                        pos += 3;
                    } else {
                        break;
                    }
                } else if (c == LIST_JUMP) {
                    if (pos + 2 <= data_len) {
                        patch = data[pos + 1];
                        pos += 2;
                    } else {
                        break;
                    }
                } else if (c == LIST_SKIP) {
                    patch++;
                    pos++;
                } else if (c == LIST_MODE) {
                    mode++;
                    bank = 0;
                    patch = 0;
                    pos++;
                    if (filter != LIST_FILTER_ALL) {
                        done = 1;
                    }
                    break;
                } else {
                    pos++;
                }
            }
        }
    }

    return result;
}

int g2_select_variation(int variation, int slot) {
    uint8_t slota[16] = {0};
    int ret;
    uint8_t extraData[1] = {0};

    if (variation < 1 || variation > 8) {
        g2_err("Invalid variation: %d (must be 1-8)\n", variation);
        return G2_ERR_INVALID_PARAM;
    }

    if (ensure_connected(0) < 0) {
            g2_err("Failed to connect to G2\n");
            return G2_ERR_CONNECT;
        }

    if (slot < 0 || slot > 3) {
        g2_err("Slot required (A, B, C, or D)\n");
        return G2_ERR_INVALID_PARAM;
    }

    g2_drain_pending();

    /* Step 1: Send [CMD_SYS, 0x41, 0x35, slot] to get slot info */
    uint8_t cmdData[4] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) {
        g2_err("Failed to send variation command 1\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    /* Skip LED (0x39) and volume (0x3A) streaming notifications to reach the version response */
    ret = -1;
    for (int attempt = 0; attempt < 20; attempt++) {
        ret = recv_interrupt(slota, sizeof(slota), USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) break;
        uint8_t subCmd = slota[4];
        if (subCmd == 0x39 || subCmd == 0x3A) { ret = -1; continue; }
        break;
    }
    if (ret <= 0) {
        g2_err("No response from G2 for variation command 1\n");
        return G2_ERR_RECV;
    }
    uint8_t version = slota[6];
    if (version) g2_slot_version[slot] = version;

    /* Step 2: Send [CMD_A + slot, version, 0x6a, variation - 1]
     * Version comes from slota[6] (matches Python embedded_message output) */
    extraData[0] = variation - 1;
    if (send_slot(slot, version, 0x6a, extraData, 1) < 0) {
        g2_err("Failed to send variation command 2\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    /* Consume any EXTENDED response (bulk data) — leaving it unread blocks the endpoint */
    {
        uint8_t response[16] = {0};
        int n = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
        if (n > 0 && (response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)response[1] << 8) | response[2];
            if (sz > 0) {
                uint8_t *bulk = malloc(sz);
                if (bulk) { recv_bulk(bulk, sz); free(bulk); }
            }
            g2_rearm();
        }
    }

    g2_drain_pending();

    return G2_OK;
}

/* ── Payload builders ───────────────────────────────────────────────────
 * Each builder encodes one USB sub-command into op->cmd/payload/len using
 * the caller-supplied buf.  These are the single source of truth for byte
 * layout; both the single-op functions and execute_seq call them. */

static void swap_connectors(int *fm, int *fct, int *fci, int *tm, int *tct, int *tci) {
    int t; t=*fm; *fm=*tm; *tm=t; t=*fct; *fct=*tct; *tct=t; t=*fci; *fci=*tci; *tci=t;
}

void g2_build_del_cable_op(G2Op *op, uint8_t *buf, int loc,
                            int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)((1<<1)|(loc&1)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    op->cmd=0x51; op->payload=buf; op->len=5;
}

void g2_build_add_cable_op(G2Op *op, uint8_t *buf, int loc, int color,
                            int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)((1<<4)|((loc&1)<<3)|(color&7)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    op->cmd=0x50; op->payload=buf; op->len=5;
}

void g2_build_set_cable_color_op(G2Op *op, uint8_t *buf, int loc, int color,
                                  int fm, int fct, int fci, int tm, int tct, int tci) {
    if (fct == 0) swap_connectors(&fm, &fct, &fci, &tm, &tct, &tci);
    buf[0]=(uint8_t)((1<<1)|(loc&1)); buf[1]=(uint8_t)fm;
    buf[2]=(uint8_t)(((fct&3)<<6)|(fci&0x3f));
    buf[3]=(uint8_t)tm; buf[4]=(uint8_t)(((tct&3)<<6)|(tci&0x3f));
    buf[5]=(uint8_t)color;
    op->cmd=0x54; op->payload=buf; op->len=6;
}

void g2_build_del_module_op(G2Op *op, uint8_t *buf, int loc, int module_id) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id;
    op->cmd=0x32; op->payload=buf; op->len=2;
}

void g2_build_move_module_op(G2Op *op, uint8_t *buf, int loc,
                              int module_id, int col, int row) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id;
    buf[2]=(uint8_t)col; buf[3]=(uint8_t)row;
    op->cmd=0x34; op->payload=buf; op->len=4;
}

int g2_build_add_module_op(G2Op *op, uint8_t *buf, int loc,
                            int type_id, int module_id, int col, int row, int color,
                            int num_modes, const int *mode_vals, const char *name) {
    int pos = 0;
    buf[pos++]=(uint8_t)type_id; buf[pos++]=(uint8_t)loc;
    buf[pos++]=(uint8_t)module_id; buf[pos++]=(uint8_t)col;
    buf[pos++]=(uint8_t)row; buf[pos++]=(uint8_t)(color&0xff);
    buf[pos++]=0x00; buf[pos++]=0x00; /* upRate, isLed */
    for (int m=0; m<num_modes; m++)
        buf[pos++]=(uint8_t)(mode_vals ? mode_vals[m] : 0);
    if (name && *name) {
        size_t nlen=strlen(name); if (nlen>16) nlen=16;
        memcpy(buf+pos, name, nlen+1); pos+=(int)nlen+1;
    } else { buf[pos++]=0x00; }
    op->cmd=0x30; op->payload=buf; op->len=pos;
    return pos;
}

void g2_build_set_module_color_op(G2Op *op, uint8_t *buf,
                                   int loc, int module_id, int color) {
    buf[0]=(uint8_t)loc; buf[1]=(uint8_t)module_id; buf[2]=(uint8_t)color;
    op->cmd=0x31; op->payload=buf; op->len=3;
}

void g2_build_set_module_label_op(G2Op *op, uint8_t *buf,
                                   int loc, int module_id, const char *label) {
    size_t nlen = label ? strlen(label) : 0; if (nlen > 16) nlen = 16;
    buf[0] = (uint8_t)loc; buf[1] = (uint8_t)module_id;
    if (label && nlen > 0) memcpy(buf+2, label, nlen);
    if (nlen < 16) buf[2+nlen] = 0x00;
    op->cmd = 0x33; op->payload = buf; op->len = (int)(2 + nlen + (nlen < 16 ? 1 : 0));
}

void g2_build_set_param_label_op(G2Op *op, uint8_t *buf,
                                  int loc, int module_id, int param_idx,
                                  int num_labels, const char **labels) {
    int payload_len = 6 + 7 * num_labels;
    int idx = 0;
    buf[idx++] = (uint8_t)loc; buf[idx++] = (uint8_t)module_id;
    buf[idx++] = (uint8_t)(3 + 7 * num_labels); buf[idx++] = 1;
    buf[idx++] = (uint8_t)(1 + 7 * num_labels); buf[idx++] = (uint8_t)param_idx;
    for (int i = 0; i < num_labels; i++) {
        const char *lbl = (labels && labels[i]) ? labels[i] : "";
        size_t llen = strlen(lbl); if (llen > 7) llen = 7;
        for (int j = 0; j < 7; j++) buf[idx++] = (j < (int)llen) ? (uint8_t)lbl[j] : 0;
    }
    if (idx < payload_len) memset(buf + idx, 0, (size_t)(payload_len - idx));
    op->cmd = 0x42; op->payload = buf; op->len = payload_len;
}

/* ── Helper: get version for slot using GET_PATCH_VERSION (with cache) */
static uint8_t cable_get_version(int slot) {
    if (g2_slot_version[slot]) return g2_slot_version[slot];
    /* cache miss — ask G2 (fallback for first use before get-patch) */
    uint8_t slota[16] = {0};
    uint8_t cmdData[2] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) return 0;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(slota, sizeof(slota), USB_TIMEOUT_STANDARD_MS);
    if (slota[6]) g2_slot_version[slot] = slota[6];
    return slota[6];
}

int g2_add_cable(int slot, int location, int color,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    if (slot < 0 || slot > 3)                { g2_err("add-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)        { g2_err("add-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)              { g2_err("add-cable: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("add-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("add-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[5]; G2Op op;
    g2_build_add_cable_op(&op, buf, location, color,
                          from_mod, from_con_type, from_con_id,
                          to_mod, to_con_type, to_con_id);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("add-cable: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_del_cable(int slot, int location,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    if (slot < 0 || slot > 3)          { g2_err("del-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("del-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[5]; G2Op op;
    g2_build_del_cable_op(&op, buf, location,
                          from_mod, from_con_type, from_con_id,
                          to_mod, to_con_type, to_con_id);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("del-cable: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_cable_color(int slot, int location, int color,
                       int from_mod, int from_con_type, int from_con_id,
                       int to_mod,   int to_con_type,   int to_con_id) {

    if (slot < 0 || slot > 3)                 { g2_err("set-cable-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)         { g2_err("set-cable-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)               { g2_err("set-cable-color: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("set-cable-color: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-cable-color: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[6]; G2Op op;
    g2_build_set_cable_color_op(&op, buf, location, color,
                                from_mod, from_con_type, from_con_id,
                                to_mod, to_con_type, to_con_id);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("set-cable-color: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_del_module(int slot, int location, int module_id) {

    if (slot < 0 || slot > 3)          { g2_err("del-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-module: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[2]; G2Op op;
    g2_build_del_module_op(&op, buf, location, module_id);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("del-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_move_module(int slot, int location, int module_id, int col, int row) {

    if (slot < 0 || slot > 3)          { g2_err("move-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("move-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("move-module: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[4]; G2Op op;
    g2_build_move_module_op(&op, buf, location, module_id, col, row);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("move-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_add_module(int slot, int location, int type_id, int module_id,
                  int col, int row, int color,
                  int num_modes, const int *mode_vals,
                  int num_params, const int *param_vals,
                  const char *name) {
    (void)num_params; (void)param_vals; /* G2 initialises params to defaults */

    if (slot < 0 || slot > 3)          { g2_err("add-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("add-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("add-module: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[512]; G2Op op;
    g2_build_add_module_op(&op, buf, location, type_id, module_id, col, row, color,
                           num_modes, mode_vals, name);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("add-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_color(int slot, int location, int module_id, int color) {

    if (slot < 0 || slot > 3)          { g2_err("set-module-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("set-module-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 24)       { g2_err("set-module-color: color must be 0-24\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-color: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[3]; G2Op op;
    g2_build_set_module_color_op(&op, buf, location, module_id, color);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("set-module-color: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_label(int slot, int location, int module_id, const char *label) {

    if (slot < 0 || slot > 3)         { g2_err("set-module-name: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-module-name: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (!label || !*label)            { g2_err("set-module-name: label must be non-empty\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-name: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[20]; G2Op op;
    g2_build_set_module_label_op(&op, buf, location, module_id, label);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("set-module-name: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_param_label(int slot, int location, int module_id, int param_idx, int num_labels, const char **labels) {

    if (slot < 0 || slot > 3)            { g2_err("set-param-label: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)    { g2_err("set-param-label: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (num_labels <= 0 || num_labels > 128) { g2_err("set-param-label: num_labels out of range\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-param-label: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t buf[6 + 7 * 128]; G2Op op;
    g2_build_set_param_label_op(&op, buf, location, module_id, param_idx, num_labels, labels);
    if (send_slot(slot, version, op.cmd, op.payload, (size_t)op.len) < 0) {
        g2_err("set-param-label: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_batch_ops(int slot, const G2Op *ops, int n_ops) {
    if (slot < 0 || slot > 3)    { g2_err("seq: invalid slot\n");      return G2_ERR_INVALID_PARAM; }
    if (n_ops <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) { g2_err("seq: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    if (send_slot_batch((uint8_t)slot, version, ops, n_ops) < 0) {
        g2_err("seq: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_mode(int slot, int location, int module_id, int param, int val) {

    if (slot < 0 || slot > 3)         { g2_err("set-module-mode: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-module-mode: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-mode: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param, (uint8_t)val };
    if (send_slot(slot, version, 0x2B, extra, 4) < 0) {
        g2_err("set-module-mode: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_select_patch(int slot, int bank, int location) {
    if (slot < 0 || slot > 3)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 127) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    uint8_t cmd[4] = { 0x0a, (uint8_t)slot, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_select_perf(int bank, int location) {
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 127) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    uint8_t cmd[4] = { 0x0a, 4, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    /* In daemon mode the listener queue is the only consumer; the daemon's
     * select-perf dispatch already drains the whole post-select cascade
     * (ACK, synth/perf settings, version updates, final BULK_REARM) and emits
     * each as a watch event. Calling recv_interrupt() here too would race it
     * for the same messages, silently swallowing whichever one it grabs
     * first (e.g. perf_settings) without emitting it or freeing its bulk
     * payload — see select-perf dispatch in daemon.c. */
    if (!g2_listener_active) {
        uint8_t response[64] = {0};
        recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
        g2_drain_pending();
    }
    return G2_OK;
}

int g2_store_patch(int slot, int bank, int location) {
    if (slot < 0 || slot > 4)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 128) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_STORE: [0x0B, slot, bank-1, location-1] */
    uint8_t cmd[4] = { 0x0b, (uint8_t)slot, (uint8_t)(bank - 1), (uint8_t)(location - 1) };
    if (send_system_data(0x41, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_clear_patch(int type, int bank, int location) {
    if (type < 0 || type > 1)           return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)          return G2_ERR_INVALID_PARAM;
    if (location < 1 || location > 128) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)        return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_CLEAR: [0x0C, type, bank-1, location-1, 0x00] */
    uint8_t cmd[5] = { 0x0c, (uint8_t)type, (uint8_t)(bank - 1), (uint8_t)(location - 1), 0x00 };
    if (send_system_data(0x41, cmd, 5) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_clear_bank(int type, int bank, int from_loc, int to_loc) {
    if (type < 0 || type > 1)             return G2_ERR_INVALID_PARAM;
    if (bank < 1 || bank > 32)            return G2_ERR_INVALID_PARAM;
    if (from_loc < 1 || from_loc > 128)   return G2_ERR_INVALID_PARAM;
    if (to_loc < 1 || to_loc > 128)       return G2_ERR_INVALID_PARAM;
    if (ensure_connected(1) < 0)          return G2_ERR_CONNECT;
    g2_drain_pending();
    /* S_CLEAR_BANK: bank written twice — matches Delphi CreateClearBankMessage */
    uint8_t cmd[7] = { 0x0e, (uint8_t)type,
                       (uint8_t)(bank - 1), (uint8_t)(from_loc - 1),
                       (uint8_t)(bank - 1), (uint8_t)(to_loc - 1), 0x00 };
    if (send_system_data(0x41, cmd, 7) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_synth_settings(cJSON *params) {
    if (!params) { g2_err("set-synth-settings: NULL params\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-synth-settings: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t data[56]; size_t len;
    if (g2_build_synth_set_msg(params, data, &len) < 0) {
        g2_err("set-synth-settings: failed to build message\n");
        return G2_ERR_INVALID_PARAM;
    }
    if (send_system_data(0x41, data, len) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_perf_mode(int mode) {
    if (mode < 0 || mode > 1) { g2_err("set-perf-mode: mode must be 0(performance) or 1(patch)\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-perf-mode: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t cmd[3] = { 0x3E, (uint8_t)mode, 0x00 };
    if (send_system_data(0x41, cmd, 3) < 0) return G2_ERR_SEND;
    /* In daemon mode: listener handles the response (aCmd=0x0C, sub=0x1F mode/slot data)
     * and sets g2_pending_rearm for the main loop.
     * In CLI mode: drain and stop streaming to prevent the all-slots version update
     * from triggering g2_rearm() and leaving the G2 in an unread streaming state. */
    if (!g2_listener_active) {
        usleep(200000);
        g2_stop_comm();
    }
    return G2_OK;
}

int g2_set_perf_name(const char *name) {
    if (!name || !*name) { g2_err("set-perf-name: name must be non-empty\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-perf-name: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    uint8_t pv_cmd[2] = { SUB_COMMAND_GET_PATCH_VERSION, 4 };
    uint8_t pv_resp[16] = {0};
    send_system_data(0x41, pv_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    int pv_ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD_MS);
    if (pv_ret <= 0) { g2_err("No response from G2 for perf version\n"); return G2_ERR; }
    uint8_t version = pv_resp[6];

    size_t nlen = strlen(name);
    if (nlen > 16) nlen = 16;
    uint8_t cmd[19];
    int pos = 0;
    cmd[pos++] = 0x29;
    memcpy(cmd + pos, name, nlen);
    pos += (int)nlen;
    if (nlen < 16) cmd[pos++] = 0;

    if (send_system_data(version, cmd, (size_t)pos) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    int ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) { g2_err("No response from G2 for set-perf-name\n"); return G2_ERR; }
    /* Check for EXTENDED response (bulk event) - must be consumed or it blocks further communication */
    if ((response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t bulkSize = ((uint16_t)response[1] << 8) | response[2];
        if (bulkSize > 0) {
            uint8_t *bulk = malloc(bulkSize);
            if (bulk) {
                recv_bulk(bulk, bulkSize);
                free(bulk);
            }
        }
    }
    g2_drain_pending();
    return G2_OK;
}

int g2_set_patch_name(int slot, const char *name) {
    if (slot < 0 || slot > 3)  { g2_err("set-patch-name: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (!name || !*name)       { g2_err("set-patch-name: name must be non-empty\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-patch-name: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    size_t nlen = strlen(name);
    if (nlen > 16) nlen = 16;
    uint8_t payload[16];
    memcpy(payload, name, nlen);
    if (nlen < 16) payload[nlen] = 0x00;
    if (send_slot(slot, version, 0x27, payload, (int)(nlen + (nlen < 16 ? 1 : 0))) < 0) {
        g2_err("set-patch-name: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_patch_description(int slot, const uint8_t *data, int len) {
    if (slot < 0 || slot > 3) { g2_err("set-patch-description: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (!data || len <= 0)    { g2_err("set-patch-description: no data\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-patch-description: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    /* G2 uses chunk format for C_PATCH_DESCR: [0x21][size_hi][size_lo][data] */
    uint8_t payload[2 + 64];
    if (len > 62) { g2_err("set-patch-description: data too long\n"); return G2_ERR_INVALID_PARAM; }
    payload[0] = (len >> 8) & 0xFF;
    payload[1] = len & 0xFF;
    memcpy(payload + 2, data, len);
    if (send_slot(slot, version, 0x21, payload, 2 + len) < 0) {
        g2_err("set-patch-description: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

/* NOTE: g2_set_voice_mode / g2_set_voice_count call g2_get_patch internally
 * (read-modify-write). Do NOT call these from an editor that has a patch
 * loaded in memory — use set-patch-description directly instead. */
static int set_voice_description_field(int slot, int field, int val) {
    const char *slot_names[] = {"A", "B", "C", "D"};
    cJSON *patch = g2_get_patch(slot_names[slot]);
    if (!patch) { g2_err("voice-field: failed to get patch for slot %d\n", slot); return G2_ERR; }

    const char *hex = cJSON_GetStringValue(cJSON_GetObjectItem(patch, "data"));
    if (!hex) { cJSON_Delete(patch); return G2_ERR_INVALID_PARAM; }

    int hex_len = (int)strlen(hex);
    int data_len = hex_len / 2;
    uint8_t *data = malloc(data_len);
    if (!data) { cJSON_Delete(patch); return G2_ERR; }
    for (int k = 0; k < data_len; k++) {
        char buf[3] = { hex[k*2], hex[k*2+1], 0 };
        data[k] = (uint8_t)strtol(buf, NULL, 16);
    }
    cJSON_Delete(patch);

    /* Find null-terminated text header */
    int text_end = -1;
    for (int k = 0; k < data_len; k++) {
        if (data[k] == 0) { text_end = k; break; }
    }
    if (text_end < 0 || text_end + 3 > data_len) { free(data); return G2_ERR_INVALID_PARAM; }

    /* Scan sections for type 0x21 (patch description) */
    int sec_off = text_end + 3;
    int guard = 0;
    while (sec_off + 3 <= data_len && guard++ < 64) {
        uint8_t type = data[sec_off];
        int body_len = (data[sec_off + 1] << 8) | data[sec_off + 2];
        if (type == 0x21) {
            uint8_t *body = data + sec_off + 3;
            if (body_len < 14 || sec_off + 3 + body_len > data_len) { free(data); return G2_ERR_INVALID_PARAM; }
            if (field == 0) {
                /* voices: bits 61-65 (5 bits) */
                body[7] = (body[7] & 0xF8) | ((val >> 2) & 0x07);
                body[8] = (body[8] & 0x3F) | ((val & 0x03) << 6);
            } else {
                /* monopoly: bits 90-91 (2 bits) */
                body[11] = (body[11] & 0xCF) | ((val & 0x03) << 4);
            }
            int ret = g2_set_patch_description(slot, body, body_len);
            free(data);
            return ret;
        }
        sec_off += 3 + body_len;
    }
    free(data);
    g2_err("voice-field: description section (0x21) not found\n");
    return G2_ERR_INVALID_PARAM;
}

int g2_set_voice_mode(int slot, int mode) {
    if (slot < 0 || slot > 3) { g2_err("voice-mode: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (mode < 0 || mode > 3) { g2_err("voice-mode: mode must be 0-3\n"); return G2_ERR_INVALID_PARAM; }
    return set_voice_description_field(slot, 1, mode);
}

int g2_set_voice_count(int slot, int count) {
    if (slot < 0 || slot > 3) { g2_err("voice-count: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (count < 1 || count > 32) { g2_err("voice-count: count must be 1-32\n"); return G2_ERR_INVALID_PARAM; }
    return set_voice_description_field(slot, 0, count);
}

static int get_perf_version(uint8_t *out_version) {
    uint8_t pv_cmd[2] = { SUB_COMMAND_GET_PATCH_VERSION, 4 };
    uint8_t pv_resp[16] = {0};
    send_system_data(0x41, pv_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) { g2_err("No response from G2 for perf version\n"); return G2_ERR; }
    *out_version = pv_resp[6];
    return G2_OK;
}

int g2_set_master_clock_run(int run) {
    if (ensure_connected(0) < 0) { g2_err("set-master-clock-run: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version;
    if (get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[4] = { 0x3F, 0xFF, 0x00, run ? 1 : 0 };
    if (send_system_data(version, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_master_clock_bpm(int bpm) {
    if (bpm < 0 || bpm > 255) { g2_err("set-master-clock-bpm: bpm out of range\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-master-clock-bpm: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version;
    if (get_perf_version(&version) < 0) return G2_ERR;
    uint8_t cmd[4] = { 0x3F, 0xFF, 0x01, (uint8_t)bpm };
    if (send_system_data(version, cmd, 4) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_upload_patch(int slot, const char *filepath) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    FILE *f = fopen(filepath, "rb");
    if (!f) return G2_ERR_FILE_OPEN;
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);
    uint8_t *file_data = (uint8_t *)malloc((size_t)fsize);
    if (!file_data) { fclose(f); return G2_ERR_NO_MEMORY; }
    fread(file_data, 1, (size_t)fsize, f);
    fclose(f);

    /* pch2 format: [text header][0x00][0x17][0x00][section bytes][2 byte CRC]
     * Use filename (without extension) as the patch name. */
    const char *base = strrchr(filepath, '/');
    base = base ? base + 1 : filepath;
    char name[16] = {0};
    int ni = 0;
    while (ni < 15 && base[ni] && base[ni] != '.') { name[ni] = base[ni]; ni++; }

    int name_end = 0;
    while (name_end < fsize && file_data[name_end]) name_end++;
    int data_offset = name_end + 3;   /* skip NUL + 0x17 + 0x00 */
    int data_len = (int)fsize - data_offset - 2;  /* exclude trailing 2-byte CRC */
    if (data_len <= 0) { free(file_data); return G2_ERR_PARSE; }

    /* Build USB packet with dynamic allocation — patch files exceed send_slot's 2048-byte stack buffer.
     * Packet: [len_hi][len_lo][0x01][cmd][0x53][0x37][0x00 x3][name+\0][section_data][crc_hi][crc_lo]
     * Version byte 0x53 is hardcoded for S_SET_PATCH (confirmed by the Delphi editor).
     * Name field is variable length: name characters followed by a null byte. */
    int name_write_len = ni + 1;  /* name chars + terminating null */
    size_t extraLen = 3 + (size_t)name_write_len + (size_t)data_len;
    size_t totalLen = COMMAND_OFFSET + 4 + extraLen + 2;
    uint8_t *buff = (uint8_t *)calloc(1, totalLen);
    if (!buff) { free(file_data); return G2_ERR_NO_MEMORY; }

    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = 0x53;  /* fixed version for S_SET_PATCH — not the dynamic patch version */
    buff[pos++] = SUB_COMMAND_SET;  /* 0x37 */
    pos += 3;  /* three zero bytes (calloc) */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    memcpy(buff + pos, file_data + data_offset, (size_t)data_len);
    pos += data_len;
    free(file_data);

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    g2_drain_pending();
    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    free(buff);
    if (ret < 0) return G2_ERR_SEND;

    usleep(USB_SEND_DELAY_US * 5);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_upload_perf(const char *filepath) {
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    FILE *f = fopen(filepath, "rb");
    if (!f) return G2_ERR_FILE_OPEN;
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    rewind(f);
    uint8_t *file_data = (uint8_t *)malloc((size_t)fsize);
    if (!file_data) { fclose(f); return G2_ERR_NO_MEMORY; }
    fread(file_data, 1, (size_t)fsize, f);
    fclose(f);

    /* prf2 format: [text header][0x00][0x17][0x00][section bytes][2 byte CRC]
     * Use filename (without extension) as the performance name. */
    const char *base = strrchr(filepath, '/');
    base = base ? base + 1 : filepath;
    char name[16] = {0};
    int ni = 0;
    while (ni < 15 && base[ni] && base[ni] != '.') { name[ni] = base[ni]; ni++; }

    int name_end = 0;
    while (name_end < fsize && file_data[name_end]) name_end++;
    int data_offset = name_end + 3;   /* skip NUL + 0x17 + 0x00 */
    int data_len = (int)fsize - data_offset - 2;  /* exclude trailing 2-byte CRC */
    if (data_len <= 0) { free(file_data); return G2_ERR_PARSE; }

    /* Performance upload: CMD_SYS (0x2C), version 0x42, subcommand 0x37 (S_SET_PATCH).
     * After the name, the G2 parser expects [$1A][$29][name\0] before the section data
     * (confirmed by Delphi AddMsgSetPerformance in BVE.NMG2Synth.pas). Without it
     * the parser finds 0x11 (C_PERF_SETTINGS) where it expects 0x1A, hanging the G2. */
    int name_write_len = ni + 1;
    size_t extraLen = 3 + (size_t)name_write_len + 2 + (size_t)name_write_len + (size_t)data_len;
    size_t totalLen = COMMAND_OFFSET + 4 + extraLen + 2;
    uint8_t *buff = (uint8_t *)calloc(1, totalLen);
    if (!buff) { free(file_data); return G2_ERR_NO_MEMORY; }

    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;  /* 0x2C — performance scope */
    buff[pos++] = 0x42;                        /* fixed version for full performance upload */
    buff[pos++] = SUB_COMMAND_SET;             /* 0x37 */
    pos += 3;  /* three zero bytes (calloc) */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    buff[pos++] = 0x1A;
    buff[pos++] = 0x29;  /* C_PERF_NAME inline header required by G2 parser */
    memcpy(buff + pos, name, (size_t)name_write_len);
    pos += name_write_len;
    memcpy(buff + pos, file_data + data_offset, (size_t)data_len);
    pos += data_len;
    free(file_data);

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    g2_drain_pending();
    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    free(buff);
    if (ret < 0) return G2_ERR_SEND;

    if (!g2_listener_active) {
        usleep(600000);  /* let G2 finish applying all 4 slots */
        g2_stop_comm();
    }
    return G2_OK;
}

cJSON *g2_get_perf_file(const char *filename) {
    uint8_t interruptResp[16] = {0};
    uint8_t selsInterrupt[16] = {0};
    uint8_t selsData[1024] = {0};
    uint8_t perfInterrupt[16] = {0};
    uint8_t *perfData = NULL;
    size_t perfSize = 0;
    uint8_t *pch2Data[4] = {NULL, NULL, NULL, NULL};
    size_t pch2Size[4] = {0, 0, 0, 0};
    uint8_t *outBuf = NULL;
    cJSON *result = NULL;

    if (ensure_connected(1) < 0) {
        g2_err("Failed to connect to G2\n");
        goto cleanup;
    }

    /* Drain stale data (same pattern as g2_get_patch_file) */
    if (!g2_listener_active) {
        uint8_t stale[16]; int n;
        while ((n = recv_interrupt(stale, sizeof(stale), USB_TIMEOUT_STALE_MS)) > 0) {
            if ((stale[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t sz = ((uint16_t)stale[1] << 8) | stale[2];
                if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
            }
        }
    }

    /* Step 1: Get performance settings raw bytes (same sequence as query_perf_settings) */
    if (send_system(0x41, 0x81) == 0) {
        usleep(USB_SEND_DELAY_US);
        int ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t size = ((uint16_t)selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    {
        int ret;
        uint16_t size;
        if (send_system(selsData[2], 0x10) == 0) {
            usleep(USB_SEND_DELAY_US);
            ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
            if (ret > 0 && (perfInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                size = ((uint16_t)perfInterrupt[1] << 8) | perfInterrupt[2];
                perfData = malloc(size);
                if (!perfData) { g2_err("Memory allocation failed\n"); goto cleanup; }
                perfSize = size;
                recv_bulk(perfData, size);
            }
        }
    }

    if (perfSize < 8) {
        g2_err("Failed to get performance settings\n");
        goto cleanup;
    }

    /* Extract performance name from perfData[4] */
    char perfName[32] = {0};
    int nameLen = parse_name(perfData + 4, perfName, sizeof(perfName));

    /* Step 2: Download all 4 slot patches */
    for (int slot = 0; slot < 4; slot++) {
        g2_err("Fetching patch from slot %c...\n", "ABCD"[slot]);

        uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)slot};
        if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
            g2_err("Failed to get patch version for slot %c\n", "ABCD"[slot]);
            goto cleanup;
        }
        usleep(USB_SEND_DELAY_US);
        int ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) { g2_err("No version response for slot %c\n", "ABCD"[slot]); goto cleanup; }
        uint8_t version = interruptResp[6];

        if (send_slot(slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
            g2_err("Failed to request patch for slot %c\n", "ABCD"[slot]);
            goto cleanup;
        }
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0 || (interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
            g2_err("Unexpected response for slot %c patch data\n", "ABCD"[slot]);
            goto cleanup;
        }

        uint16_t patchSize = ((uint16_t)interruptResp[1] << 8) | interruptResp[2];
        uint8_t *patchData = malloc(patchSize);
        if (!patchData) { g2_err("Memory allocation failed\n"); goto cleanup; }
        ret = recv_bulk(patchData, patchSize);
        if (ret <= 0) {
            free(patchData);
            g2_err("Failed to read patch bulk for slot %c\n", "ABCD"[slot]);
            goto cleanup;
        }

        pch2Data[slot] = malloc(patchSize);
        if (!pch2Data[slot]) { free(patchData); g2_err("Memory allocation failed\n"); goto cleanup; }
        pch2Size[slot] = (size_t)patchSize;
        if (patch_usb_to_pch2(patchData, (size_t)patchSize, pch2Data[slot], &pch2Size[slot]) < 0) {
            free(patchData);
            g2_err("Failed to convert patch for slot %c\n", "ABCD"[slot]);
            goto cleanup;
        }
        free(patchData);
    }

    /* Step 3: Determine output filename */
    char defaultFilename[64];
    if (filename == NULL) {
        if (strlen(perfName) == 0)
            snprintf(defaultFilename, sizeof(defaultFilename), "performance.prf2");
        else
            snprintf(defaultFilename, sizeof(defaultFilename), "%s.prf2", perfName);
        filename = defaultFilename;
    }

    /* Step 4: Assemble .prf2 file in memory.
     * 0x11 section content = perfData[4 + nameLen + 3 .. perfSize-1].
     * Offset +3 skips 3 unknown header bytes after the name; byte at +3 maps to unknown2
     * and bytes at +4..+10 map to the 8-byte performance settings header fields. */
    size_t perf_sect_offset = (size_t)(4 + nameLen + 3);
    size_t perf_sect_len = (perf_sect_offset < perfSize) ? (perfSize - perf_sect_offset) : 0;

    size_t header_len = strlen(perfName) + 3;  /* name + null + 0x17 + 0x00 */
    size_t sect11_total = 3 + perf_sect_len;   /* [0x11][hi][lo] + data */
    size_t slots_sect_len = 0;
    for (int s = 0; s < 4; s++)
        slots_sect_len += (pch2Size[s] > 18) ? (pch2Size[s] - 18) : 0;
    slots_sect_len += 3 * 3;  /* three 0x6f separator sections between the 4 slots */

    outBuf = malloc(header_len + sect11_total + slots_sect_len + 2);
    if (!outBuf) { g2_err("Memory allocation failed\n"); goto cleanup; }

    size_t pos = 0;

    /* File header: [perfName\0][0x17][0x00] */
    size_t pnlen = strlen(perfName);
    memcpy(outBuf + pos, perfName, pnlen); pos += pnlen;
    outBuf[pos++] = 0x00;
    outBuf[pos++] = 0x17;
    outBuf[pos++] = 0x00;

    size_t crc_start = pos;  /* CRC covers from here to end-2 */

    /* 0x11 performance settings section */
    outBuf[pos++] = 0x11;
    outBuf[pos++] = (uint8_t)((perf_sect_len >> 8) & 0xff);
    outBuf[pos++] = (uint8_t)(perf_sect_len & 0xff);
    if (perf_sect_len > 0) {
        memcpy(outBuf + pos, perfData + perf_sect_offset, perf_sect_len);
        pos += perf_sect_len;
    }

    /* Slot sections with 0x6f separators between slots */
    static const uint8_t sep6f[3] = {0x6f, 0x00, 0x00};
    for (int s = 0; s < 4; s++) {
        if (pch2Size[s] > 18) {
            memcpy(outBuf + pos, pch2Data[s] + 18, pch2Size[s] - 18);
            pos += pch2Size[s] - 18;
        }
        if (s < 3) {
            memcpy(outBuf + pos, sep6f, 3);
            pos += 3;
        }
    }

    /* CRC over all section bytes */
    uint16_t crc = calc_crc16(outBuf + crc_start, pos - crc_start);
    outBuf[pos++] = (uint8_t)((crc >> 8) & 0xff);
    outBuf[pos++] = (uint8_t)(crc & 0xff);

    {
        FILE *f = fopen(filename, "wb");
        if (!f) { g2_err("Failed to open file '%s' for writing\n", filename); goto cleanup; }
        size_t written = fwrite(outBuf, 1, pos, f);
        fclose(f);
        if (written != pos) { g2_err("Failed to write complete file\n"); goto cleanup; }
    }

    result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "file", filename);
    cJSON_AddStringToObject(result, "name", perfName);
    cJSON_AddNumberToObject(result, "size", (int)pos);

cleanup:
    free(perfData);
    for (int s = 0; s < 4; s++) free(pch2Data[s]);
    free(outBuf);
    return result;
}

int g2_copy_variation(int slot, int from_var, int to_var) {
    if (slot < 0 || slot > 3)         { g2_err("copy-variation: invalid slot\n");     return G2_ERR_INVALID_PARAM; }
    if (from_var < 0 || from_var > 8) { g2_err("copy-variation: from must be 0-8\n"); return G2_ERR_INVALID_PARAM; }
    if (to_var < 0 || to_var > 8)     { g2_err("copy-variation: to must be 0-8\n");   return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0)      { g2_err("copy-variation: not connected\n");    return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t payload[2] = { (uint8_t)from_var, (uint8_t)to_var };
    if (send_slot(slot, version, 0x44, payload, 2) < 0) {
        g2_err("copy-variation: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation) {
    if (slot < 0 || slot > 3)         return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 2) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)      return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);

    uint8_t buff[2048] = {0};
    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_WRITE_NO_RESP | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = version;
    buff[pos++] = 0x40; /* SUB_COMMAND_SET_PARAM */
    buff[pos++] = (uint8_t)location;
    buff[pos++] = (uint8_t)module_id;
    buff[pos++] = (uint8_t)param_idx;
    buff[pos++] = (uint8_t)value;
    buff[pos++] = (uint8_t)variation;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff,
                                   msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    return (ret < 0) ? G2_ERR_SEND : G2_OK;
    /* No recv_interrupt — WRITE_NO_RESP */
}

int g2_assign_midicc(int slot, int location, int module_id, int param_idx, int cc_num) {
    if (slot < 0 || slot > 3)           return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 2)   return G2_ERR_INVALID_PARAM;
    if (cc_num < 0 || cc_num > 119)     return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)        return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t payload[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param_idx, (uint8_t)cc_num };
    return send_slot((uint8_t)slot, version, 0x22, payload, 4) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_midicc(int slot, int cc_num) {
    if (slot < 0 || slot > 3)       return G2_ERR_INVALID_PARAM;
    if (cc_num < 0 || cc_num > 119) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)    return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t cc_byte = (uint8_t)cc_num;
    return send_slot((uint8_t)slot, version, 0x23, &cc_byte, 1) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_assign_midicc_batch(int slot, const G2MidiCCEntry *entries, int count) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (count <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t entry_bufs[count][4];
    G2Op ops[count];
    for (int i = 0; i < count; i++) {
        entry_bufs[i][0] = (uint8_t)entries[i].location;
        entry_bufs[i][1] = (uint8_t)entries[i].module_id;
        entry_bufs[i][2] = (uint8_t)entries[i].param_idx;
        entry_bufs[i][3] = (uint8_t)entries[i].cc_num;
        ops[i].cmd     = 0x22;
        ops[i].payload = entry_bufs[i];
        ops[i].len     = 4;
    }
    return send_slot_batch((uint8_t)slot, version, ops, count) < 0 ? G2_ERR_SEND : G2_OK;
}

int g2_deassign_midicc_batch(int slot, const int *cc_nums, int count) {
    if (slot < 0 || slot > 3)    return G2_ERR_INVALID_PARAM;
    if (count <= 0)               return G2_OK;
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);
    uint8_t cc_bytes[count];
    G2Op ops[count];
    for (int i = 0; i < count; i++) {
        cc_bytes[i]    = (uint8_t)cc_nums[i];
        ops[i].cmd     = 0x23;
        ops[i].payload = &cc_bytes[i];
        ops[i].len     = 1;
    }
    return send_slot_batch((uint8_t)slot, version, ops, count) < 0 ? G2_ERR_SEND : G2_OK;
}

/* GET_RESOURCES_USED (0x71): query FX (loc=0) then VA (loc=1) and return a
 * plain JSON array matching the "data" field of the resources_used watch event:
 * [loc][27 bytes][0x72 sub-cmd][loc][27 bytes] (57 bytes compound packet).
 * Falls back to FX-only (28 bytes) if the VA query fails. */
cJSON *g2_get_resources(const char *slot_str) {
    uint8_t interruptResp[16] = {0};
    uint8_t version;
    int ret;

    if (ensure_connected(1) < 0) { g2_err("Failed to connect to G2\n"); return NULL; }

    int slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) { g2_err("Invalid slot: %s\n", slot_str); return NULL; }

    /* Get patch version */
    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) { g2_err("Failed to get version\n"); return NULL; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) { g2_err("No version response\n"); return NULL; }
    version = interruptResp[6];

    /* Query FX area (loc=0) */
    uint8_t loc = 0;
    if (send_slot(slot, version, 0x71, &loc, 1) < 0) { g2_err("Failed to send get-resources\n"); return NULL; }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response for get-resources\n"); return NULL;
    }

    uint16_t fxBulkSize = ((uint16_t)interruptResp[1] << 8) | interruptResp[2];
    if (fxBulkSize < 6) { g2_err("get-resources: FX bulk too small\n"); return NULL; }
    uint8_t *fxBulk = malloc(fxBulkSize);
    if (!fxBulk) { g2_err("Memory allocation failed\n"); return NULL; }

    int fxRet = recv_bulk(fxBulk, fxBulkSize);
    if (fxRet < 6) { free(fxBulk); g2_err("Failed to read resources FX bulk\n"); return NULL; }
    int fxDataEnd = fxRet - 2;  /* strip 2-byte CRC */

    cJSON *arr = cJSON_CreateArray();

    /* Query VA area (loc=1) and build compound packet if successful */
    uint8_t loc1 = 1;
    if (send_slot(slot, version, 0x71, &loc1, 1) == 0) {
        usleep(USB_SEND_DELAY_US);
        uint8_t vaInterrupt[16] = {0};
        int ret2 = recv_interrupt(vaInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret2 > 0 && (vaInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t vaBulkSize = ((uint16_t)vaInterrupt[1] << 8) | vaInterrupt[2];
            if (vaBulkSize >= 6) {
                uint8_t *vaBulk = malloc(vaBulkSize);
                if (vaBulk) {
                    int vaRet = recv_bulk(vaBulk, vaBulkSize);
                    if (vaRet >= 6) {
                        int vaDataEnd = vaRet - 2;
                        for (int i = 4; i < fxDataEnd; i++)
                            cJSON_AddItemToArray(arr, cJSON_CreateNumber(fxBulk[i]));
                        cJSON_AddItemToArray(arr, cJSON_CreateNumber(0x72));
                        for (int i = 4; i < vaDataEnd; i++)
                            cJSON_AddItemToArray(arr, cJSON_CreateNumber(vaBulk[i]));
                        free(vaBulk);
                        free(fxBulk);
                        return arr;
                    }
                    free(vaBulk);
                }
            }
        }
    }

    /* Fall back: return FX data only */
    for (int i = 4; i < fxDataEnd; i++)
        cJSON_AddItemToArray(arr, cJSON_CreateNumber(fxBulk[i]));
    free(fxBulk);
    return arr;
}

/* Read the current perf settings, patch one byte for the target slot, and
 * write the full blob back using SET_PERF_SETTINGS (sub-cmd 0x11).
 * field_offset: 0 = active (bit 0), 1 = key (bit 0). */
static int g2_set_slot_perf_field(int slot_idx, int field_offset, int value) {
    if (slot_idx < 0 || slot_idx > 3) { g2_err("set-slot-perf: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-slot-perf: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    /* Step 1: UNKNOWN_1 (0x81) → perf version at selsData[2] */
    uint8_t selsIntr[16] = {0}, selsData[256] = {0};
    if (send_system(0x41, 0x81) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(selsIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (selsIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return G2_ERR_RECV;
    uint16_t size = (uint16_t)((selsIntr[1] << 8) | selsIntr[2]);
    recv_bulk(selsData, size < sizeof(selsData) ? size : sizeof(selsData));
    uint8_t perf_version = selsData[2];

    /* Step 2: GET_PERF_SETTINGS (0x10) */
    uint8_t perfIntr[16] = {0};
    uint8_t *perfData = malloc(2048);
    if (!perfData) return G2_ERR_NO_MEMORY;
    size_t perfSize = 0;
    if (send_system(perf_version, 0x10) < 0) { free(perfData); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(perfIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (perfIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) { free(perfData); return G2_ERR_RECV; }
    size = (uint16_t)((perfIntr[1] << 8) | perfIntr[2]);
    if (size == 0 || size > 2048) { free(perfData); return G2_ERR_RECV; }
    perfSize = size;
    recv_bulk(perfData, perfSize);

    /* Step 3: navigate binary (same path as perf_parse_and_add) to find the
     * target slot's field byte and patch it in-place. */
    char tmpName[32];
    const uint8_t *remaining = perfData + 4;
    int nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;
    const uint8_t *slotPtr = remaining + 11;
    const uint8_t *perfEnd = perfData + perfSize;
    int found = 0;
    for (int i = 0; i < 4; i++) {
        if (slotPtr >= perfEnd) break;
        int maxName = (int)(perfEnd - slotPtr);
        if (maxName > 17) maxName = 17;
        nameLen = parse_name(slotPtr, tmpName, maxName);
        if (slotPtr + nameLen + 7 > perfEnd) break;
        if (i == slot_idx) {
            size_t byte_offset = (size_t)(slotPtr - perfData) + (size_t)nameLen + (size_t)field_offset;
            perfData[byte_offset] = (uint8_t)(value & 0xFF);
            found = 1;
            break;
        }
        slotPtr += nameLen + 10;
    }
    if (!found) { free(perfData); return G2_ERR_PARSE; }

    /* Step 4: send the C_PERF_SETTINGS chunk — matches Delphi CreateSetPerfSettingsMessage:
     * [0x11][sizeHi][sizeLo][settings data]. 'remaining' points to the 0x11 byte. */
    uint16_t inner_size = ((uint16_t)remaining[1] << 8) | remaining[2];
    int send_ret = send_system_data(perf_version, remaining, (size_t)3 + inner_size);
    free(perfData);
    if (send_ret < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);

    /* Step 5: drain ACK in direct mode; in daemon mode the listener handles it
     * and consuming here would silently swallow slot_change/perf_name events. */
    if (!g2_listener_active) {
        uint8_t ackResp[16] = {0};
        recv_interrupt(ackResp, 16, USB_TIMEOUT_STANDARD_MS);
        g2_drain_pending();
    }
    return G2_OK;
}

int g2_set_slot_enabled(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 0, value);
}

int g2_set_slot_key(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 1, value);
}

int g2_set_slot_hold(int slot_idx, int value) {
    return g2_set_slot_perf_field(slot_idx, 2, value);
}

int g2_set_slot_range(int slot_idx, int lower, int upper) {
    if (slot_idx < 0 || slot_idx > 3) { g2_err("set-slot-range: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-slot-range: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    uint8_t selsIntr[16] = {0}, selsData[256] = {0};
    if (send_system(0x41, 0x81) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(selsIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (selsIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return G2_ERR_RECV;
    uint16_t size = (uint16_t)((selsIntr[1] << 8) | selsIntr[2]);
    recv_bulk(selsData, size < sizeof(selsData) ? size : sizeof(selsData));
    uint8_t perf_version = selsData[2];

    uint8_t perfIntr[16] = {0};
    uint8_t *perfData = malloc(2048);
    if (!perfData) return G2_ERR_NO_MEMORY;
    size_t perfSize = 0;
    if (send_system(perf_version, 0x10) < 0) { free(perfData); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(perfIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (perfIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) { free(perfData); return G2_ERR_RECV; }
    size = (uint16_t)((perfIntr[1] << 8) | perfIntr[2]);
    if (size == 0 || size > 2048) { free(perfData); return G2_ERR_RECV; }
    perfSize = size;
    recv_bulk(perfData, perfSize);

    char tmpName[32];
    const uint8_t *remaining = perfData + 4;
    int nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;
    const uint8_t *slotPtr = remaining + 11;
    const uint8_t *perfEnd = perfData + perfSize;
    int found = 0;
    for (int i = 0; i < 4; i++) {
        if (slotPtr >= perfEnd) break;
        int maxName = (int)(perfEnd - slotPtr);
        if (maxName > 17) maxName = 17;
        nameLen = parse_name(slotPtr, tmpName, maxName);
        if (slotPtr + nameLen + 7 > perfEnd) break;
        if (i == slot_idx) {
            size_t base = (size_t)(slotPtr - perfData) + (size_t)nameLen;
            perfData[base + 5] = (uint8_t)(lower & 0xFF);
            perfData[base + 6] = (uint8_t)(upper & 0xFF);
            found = 1;
            break;
        }
        slotPtr += nameLen + 10;
    }
    if (!found) { free(perfData); return G2_ERR_PARSE; }

    uint16_t inner_size = ((uint16_t)remaining[1] << 8) | remaining[2];
    int send_ret = send_system_data(perf_version, remaining, (size_t)3 + inner_size);
    free(perfData);
    if (send_ret < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);

    if (!g2_listener_active) {
        uint8_t ackResp[16] = {0};
        recv_interrupt(ackResp, 16, USB_TIMEOUT_STANDARD_MS);
        g2_drain_pending();
    }
    return G2_OK;
}

/* Modify a single byte in the performance header (at remaining[offset]):
 * remaining[5]=rangeEnable (KB Split) */
static int g2_set_perf_header_byte(int offset, int value) {
    if (ensure_connected(0) < 0) { g2_err("set-perf-header: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();

    uint8_t selsIntr[16] = {0}, selsData[256] = {0};
    if (send_system(0x41, 0x81) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(selsIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (selsIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return G2_ERR_RECV;
    uint16_t size = (uint16_t)((selsIntr[1] << 8) | selsIntr[2]);
    recv_bulk(selsData, size < sizeof(selsData) ? size : sizeof(selsData));
    uint8_t perf_version = selsData[2];

    uint8_t perfIntr[16] = {0};
    uint8_t *perfData = malloc(2048);
    if (!perfData) return G2_ERR_NO_MEMORY;
    size_t perfSize = 0;
    if (send_system(perf_version, 0x10) < 0) { free(perfData); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(perfIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (perfIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) { free(perfData); return G2_ERR_RECV; }
    size = (uint16_t)((perfIntr[1] << 8) | perfIntr[2]);
    if (size == 0 || size > 2048) { free(perfData); return G2_ERR_RECV; }
    perfSize = size;
    recv_bulk(perfData, perfSize);

    char tmpName[32];
    const uint8_t *remaining = perfData + 4;
    int nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;

    size_t byte_offset = (size_t)(remaining - perfData) + (size_t)offset;
    if (byte_offset >= perfSize) { free(perfData); return G2_ERR_PARSE; }
    perfData[byte_offset] = (uint8_t)(value & 0xFF);

    uint16_t inner_size = ((uint16_t)remaining[1] << 8) | remaining[2];
    int send_ret = send_system_data(perf_version, remaining, (size_t)3 + inner_size);
    free(perfData);
    if (send_ret < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);

    if (!g2_listener_active) {
        uint8_t ackResp[16] = {0};
        recv_interrupt(ackResp, 16, USB_TIMEOUT_STANDARD_MS);
        g2_drain_pending();
    }
    return G2_OK;
}

int g2_set_rangeEnable(int value) { return g2_set_perf_header_byte(5, value); }

/* Select a slot, activating it if it is currently inactive.
 * Sends SET_PERF_SETTINGS to enable/key the target and disable/unkey the
 * currently-focused slot, then sends SELECT_SLOT (0x09).
 * If the target slot is already active, skips the perf settings write. */
int g2_switch_slot(const char *slot_str) {
    int target = parse_slot(slot_str);
    if (target < 0 || target > 3) { g2_err("switch-slot: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) return G2_ERR_CONNECT;
    g2_drain_pending();

    /* Step 1: UNKNOWN_1 (0x81) → perf version at selsData[2] */
    uint8_t selsIntr[16] = {0}, selsData[256] = {0};
    if (send_system(0x41, 0x81) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    int ret = recv_interrupt(selsIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (selsIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return G2_ERR_RECV;
    uint16_t size = (uint16_t)((selsIntr[1] << 8) | selsIntr[2]);
    recv_bulk(selsData, size < sizeof(selsData) ? size : sizeof(selsData));
    uint8_t perf_version = selsData[2];

    /* Step 2: GET_PERF_SETTINGS (0x10) */
    uint8_t perfIntr[16] = {0};
    uint8_t *perfData = malloc(2048);
    if (!perfData) return G2_ERR_NO_MEMORY;
    if (send_system(perf_version, 0x10) < 0) { free(perfData); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(perfIntr, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0 || (perfIntr[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) { free(perfData); return G2_ERR_RECV; }
    size = (uint16_t)((perfIntr[1] << 8) | perfIntr[2]);
    if (size == 0 || size > 2048) { free(perfData); return G2_ERR_RECV; }
    recv_bulk(perfData, size);

    /* Step 3: navigate binary to find the focused slot and per-slot active/key bytes.
     * perfData+4 → perf name (variable) → 0x11 chunk header:
     *   [3]=FUnknown2(8b), [4]=FUnknown3(4b)|FSelectedSlot(2b)|FUnknown4(2b)
     * Slot data at remaining+11: each slot = name(variable) + 10 bytes
     *   [+0]=active, [+1]=key, rest=hold/bank/patch/range/pad */
    char tmpName[32];
    const uint8_t *remaining = perfData + 4;
    int nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;
    int focused = (remaining[4] >> 2) & 0x3;

    const uint8_t *slotPtr = remaining + 11;
    const uint8_t *perfEnd  = perfData + size;
    size_t target_off = 0, focused_off = 0;
    int target_active = 0, found_target = 0, found_focused = 0;
    for (int i = 0; i < 4; i++) {
        if (slotPtr >= perfEnd) break;
        int mx = (int)(perfEnd - slotPtr); if (mx > 17) mx = 17;
        nameLen = parse_name(slotPtr, tmpName, mx);
        if (slotPtr + nameLen + 7 > perfEnd) break;
        size_t base = (size_t)(slotPtr - perfData) + (size_t)nameLen;
        if (i == target)  { target_off  = base; target_active = perfData[base] & 1; found_target  = 1; }
        if (i == focused) { focused_off = base;                                      found_focused = 1; }
        slotPtr += nameLen + 10;
    }
    if (!found_target) { free(perfData); return G2_ERR_PARSE; }

    /* Fast path: slot already active — just focus it */
    if (target_active) { free(perfData); return g2_select_slot(slot_str); }

    /* Activate target slot, deactivate currently-focused slot */
    perfData[target_off + 0] = 1;
    perfData[target_off + 1] = 1;
    if (found_focused && focused != target) {
        perfData[focused_off + 0] = 0;
        perfData[focused_off + 1] = 0;
    }

    /* Step 4: send SET_PERF_SETTINGS (0x11); chunk starts at `remaining` (the 0x11 byte) */
    uint16_t inner = ((uint16_t)remaining[1] << 8) | remaining[2];
    int sret = send_system_data(perf_version, remaining, (size_t)3 + inner);
    free(perfData);
    if (sret < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    /* Drain SET_PERF_SETTINGS ACK from listener queue. */
    {
        uint8_t ack[16] = {0};
        recv_interrupt(ack, 16, USB_TIMEOUT_STANDARD_MS);
        if (!g2_listener_active) g2_drain_pending();
    }

    /* Step 5: SELECT_SLOT (0x09) — send directly, no GET_PATCH_VERSION.
     * In daemon mode, perf_settings_update sits in the queue after the ACK;
     * g2_select_slot's recv_interrupt would pop it instead of the version
     * response, leaving that response orphaned as a spurious patch_version event.
     * Delphi never queries GET_PATCH_VERSION before SELECT_SLOT; 0x41 is
     * accepted unconditionally by the G2 for this command. */
    uint8_t sel[2] = {0x09, (uint8_t)target};
    if (send_system_data(0x41, sel, 2) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    if (!g2_listener_active) g2_drain_pending();
    return G2_OK;
}

