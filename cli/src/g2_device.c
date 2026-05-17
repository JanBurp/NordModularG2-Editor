/*
 * G2 CLI - Device implementation
 * Based on usbComms.c from G2-Edit
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

static g2_error_cb_t g2_error_cb = NULL;
static void *g2_error_cb_ctx = NULL;

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

    /* Drain any stale notifications before sending CMD_INIT so we don't
     * mistake a leftover notification for the init response. */
    g2_drain_pending();

    if (send_init_msg() < 0) {
        g2_err("Failed to send init message\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    int ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
    if (ret <= 0) {
        g2_err("No response to init message\n");
        return G2_ERR_RECV;
    }

    if ((response[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type to init: %02x\n", response[0]);
        return G2_ERR_RECV;
    }

    uint16_t size = ((uint16_t)response[1] << 8) | response[2];
    if (size > 0) {
        uint8_t *data = malloc(size);
        if (!data) return G2_ERR_NO_MEMORY;
        recv_bulk(data, size);
        uint8_t first = data[0];
        free(data);
        if (first != RESPONSE_TYPE_INIT) {
            /* Stale notification bulk arrived instead of the init response
             * (e.g. after a daemon session left the G2 in streaming mode).
             * Drain remaining notifications and retry CMD_INIT once. */
            g2_drain_pending();
            if (send_init_msg() < 0) { g2_err("Failed to resend init\n"); return G2_ERR_SEND; }
            usleep(USB_SEND_DELAY_US);
            ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
            if (ret <= 0) { g2_err("No response to init retry\n"); return G2_ERR_RECV; }
            if ((response[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) return G2_ERR_RECV;
            size = ((uint16_t)response[1] << 8) | response[2];
            if (size > 0) {
                data = malloc(size);
                if (!data) return G2_ERR_NO_MEMORY;
                recv_bulk(data, size);
                first = data[0];
                free(data);
                if (first != RESPONSE_TYPE_INIT) {
                    g2_err("Unexpected init response data: %02x\n", first);
                    return G2_ERR_RECV;
                }
            }
        }
    }

    return G2_OK;
}

cJSON *query_perf_settings(int mode, const char *type) {
    uint8_t selsData[1024] = {0}, selsInterrupt[16] = {0};
    uint8_t perfData[1024] = {0}, perfInterrupt[16] = {0};
    size_t perfSize = 0;
    int ret;
    uint16_t size;

    if (send_system(0x41, 0x81) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    if (send_system(selsData[2], 0x10) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_STANDARD_MS);
        if (ret > 0 && (perfInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (perfInterrupt[1] << 8) | perfInterrupt[2];
            perfSize = size;
            recv_bulk(perfData, size);
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

    /* Drain stale notifications left over from any prior command or session
     * before issuing GET_SYNTH_SETTINGS — same guard used in g2_get_patch(). */
    g2_drain_pending();

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

    /* Flush any stale G2 data left in the USB FIFO from a previous command */
    {
        uint8_t stale[16]; int n, stale_count = 0;
        while ((n = recv_interrupt(stale, sizeof(stale), USB_TIMEOUT_STALE_MS)) > 0) {
            stale_count++;
            if ((stale[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t sz = ((uint16_t)stale[1] << 8) | stale[2];
                if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
            }
        }
        (void)stale_count;
    }

    /* Step 1: Get version for the slot */
    /* Send: [CMD_SYS, 0x41, 0x35, slot] */
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

    /* g2ctl extracts version from embedded message.
     * Embedded response format: [length][data...][CRC]
     * g2ctl returns data starting at index 1 (after length byte), so response[5] = byte[6] of raw
     */
    version = interruptResp[6];

    /* Step 2: Get patch data with version */
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
    if (ret <= 0) {
        g2_err("Failed to read patch bulk data\n");
        free(patchData);
        patchData = NULL;
        goto cleanup;
    }

    /* Step 3: Get patch name */
    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        free(patchData);
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
    cJSON_AddStringToObject(root, "slot", (char*[]){ "a", "b", "c", "d" }[slot]);
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
    cJSON_AddStringToObject(result, "slot", (char*[]){ "a", "b", "c", "d" }[slot]);
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
    uint8_t response[16] = {0};
    uint8_t version;
    uint8_t mask;
    uint8_t data[8] = {0};

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

    /* Steps 1+2 use the performance version (slot=4), not the patch slot version.
     * Per doc/usb.md §6 and g2ctl.py: SELECT_SLOT is a performance-level command. */
    {
        uint8_t pv_cmd[2] = {SUB_COMMAND_GET_PATCH_VERSION, 4};
        uint8_t pv_resp[16] = {0};
        send_system_data(0x41, pv_cmd, 2);
        usleep(USB_SEND_DELAY_US);
        int pv_ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD_MS);
        version = (pv_ret > 0 && pv_resp[6]) ? pv_resp[6] : 0x41;
    }

    /* Step 1: select bitmask */
    mask = 0x08 >> slot;
    data[0] = 0x07;
    data[1] = mask;
    data[2] = 0x0f;
    data[3] = mask;
    if (send_system_data(version, data, 4) < 0) {
        g2_err("Failed to send slot command 1\n");
        return G2_ERR_SEND;
    }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);

    /* Step 2: set active slot index */
    data[0] = 0x09;
    data[1] = slot;
    if (send_system_data(version, data, 2) < 0) {
        g2_err("Failed to send slot command 2\n");
        return G2_ERR_SEND;
    }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
    /* Drain slot_change/assigned_voices notifications that steps 1&2 trigger;
     * leaving them unread can stall the bulk-OUT endpoint when step 3 sends. */
    g2_drain_pending();

    /* Step 3: slot-scoped commit — [01][28+slot][0x0a][0x70][CRC] (per g2ctl.py).
     * If the G2 responds with an EXTENDED message (bulk data on endpoint 0x82),
     * consume the bulk immediately — leaving it unread blocks subsequent commands. */
    if (send_slot(slot, 0x0a, 0x70, NULL, 0) < 0) {
        g2_err("Failed to send slot command 3\n");
        return G2_ERR_SEND;
    }
    {
        int n = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD_MS);
        if (n > 0 && (response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)response[1] << 8) | response[2];
            if (sz > 0) {
                uint8_t *bulk = malloc(sz);
                if (bulk) { recv_bulk(bulk, sz); free(bulk); }
            }
        }
    }

    g2_drain_pending();

    return G2_OK;
}

/* G2 Categories - from nord/g2/categories.py */
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

                    if (nameLen <= 0 || pos + nameLen >= data_len) {
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
                    pos += nameLen + 1;
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
    uint8_t response[16] = {0};
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

    ret = recv_interrupt_with_retry(slota, 16, USB_TIMEOUT_STANDARD_MS, 5);
    if (ret <= 0) {
        g2_err("No response from G2 for variation command 1\n");
        return G2_ERR_RECV;
    }
    uint8_t version = slota[6];

    /* Step 2: Send [CMD_A + slot, version, 0x6a, variation - 1]
     * Version comes from slota[6] (matches Python embedded_message output) */
    extraData[0] = variation - 1;
    if (send_slot(slot, version, 0x6a, extraData, 1) < 0) {
        g2_err("Failed to send variation command 2\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt_with_retry(response, 16, USB_TIMEOUT_STANDARD_MS, 5);

    return (ret > 0) ? G2_OK : G2_ERR_RECV;
}

/* Helper: get version for slot using GET_PATCH_VERSION (shared pattern) */
static uint8_t cable_get_version(int slot) {
    uint8_t slota[16] = {0};
    uint8_t cmdData[2] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) return 0;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(slota, sizeof(slota), USB_TIMEOUT_STANDARD_MS);
    return slota[6];
}

int g2_add_cable(int slot, int location, int color,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)                { g2_err("add-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)        { g2_err("add-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)              { g2_err("add-cable: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("add-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("add-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    /* Enforce output→input: swap if from is an input */
    if (from_con_type == 0) {
        int tmp;
        tmp = from_mod;      from_mod      = to_mod;       to_mod       = tmp;
        tmp = from_con_type; from_con_type = to_con_type;  to_con_type  = tmp;
        tmp = from_con_id;   from_con_id   = to_con_id;    to_con_id    = tmp;
    }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[5] = {
        (uint8_t)((1 << 4) | ((location & 1) << 3) | (color & 7)),
        (uint8_t)from_mod,
        (uint8_t)(((from_con_type & 3) << 6) | (from_con_id & 0x3f)),
        (uint8_t)to_mod,
        (uint8_t)(((to_con_type & 3) << 6) | (to_con_id & 0x3f)),
    };
    if (send_slot(slot, version, 0x50, extra, 5) < 0) {
        g2_err("add-cable: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_del_cable(int slot, int location,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)          { g2_err("del-cable: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-cable: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("del-cable: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-cable: failed to connect\n"); return G2_ERR_CONNECT; }

    /* Enforce output→input: swap if from is an input */
    if (from_con_type == 0) {
        int tmp;
        tmp = from_mod;      from_mod      = to_mod;       to_mod       = tmp;
        tmp = from_con_type; from_con_type = to_con_type;  to_con_type  = tmp;
        tmp = from_con_id;   from_con_id   = to_con_id;    to_con_id    = tmp;
    }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[5] = {
        (uint8_t)((1 << 1) | (location & 1)),
        (uint8_t)from_mod,
        (uint8_t)(((from_con_type & 3) << 6) | (from_con_id & 0x3f)),
        (uint8_t)to_mod,
        (uint8_t)(((to_con_type & 3) << 6) | (to_con_id & 0x3f)),
    };
    if (send_slot(slot, version, 0x51, extra, 5) < 0) {
        g2_err("del-cable: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_cable_color(int slot, int location, int color,
                       int from_mod, int from_con_type, int from_con_id,
                       int to_mod,   int to_con_type,   int to_con_id) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)                 { g2_err("set-cable-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)         { g2_err("set-cable-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 6)               { g2_err("set-cable-color: color must be 0-6\n"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("set-cable-color: connector type must be 0(in) or 1(out)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-cable-color: failed to connect\n"); return G2_ERR_CONNECT; }

    /* Enforce output→input: swap if from is an input */
    if (from_con_type == 0) {
        int tmp;
        tmp = from_mod;      from_mod      = to_mod;       to_mod       = tmp;
        tmp = from_con_type; from_con_type = to_con_type;  to_con_type  = tmp;
        tmp = from_con_id;   from_con_id   = to_con_id;    to_con_id    = tmp;
    }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[6] = {
        (uint8_t)((1 << 1) | (location & 1)),
        (uint8_t)from_mod,
        (uint8_t)(((from_con_type & 3) << 6) | (from_con_id & 0x3f)),
        (uint8_t)to_mod,
        (uint8_t)(((to_con_type & 3) << 6) | (to_con_id & 0x3f)),
        (uint8_t)color,
    };
    if (send_slot(slot, version, 0x54, extra, 6) < 0) {
        g2_err("set-cable-color: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_del_module(int slot, int location, int module_id) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)          { g2_err("del-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("del-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("del-module: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[2] = { (uint8_t)location, (uint8_t)module_id };
    if (send_slot(slot, version, 0x32, extra, 2) < 0) {
        g2_err("del-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_move_module(int slot, int location, int module_id, int col, int row) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)          { g2_err("move-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("move-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("move-module: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)col, (uint8_t)row };
    if (send_slot(slot, version, 0x34, extra, 4) < 0) {
        g2_err("move-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_add_module(int slot, int location, int type_id, int module_id,
                  int col, int row, int color,
                  int num_modes, const int *mode_vals,
                  int num_params, const int *param_vals,
                  const char *name) {
    (void)num_params; (void)param_vals; /* G2 initialises params to defaults */

    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)          { g2_err("add-module: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("add-module: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("add-module: failed to connect\n"); return G2_ERR_CONNECT; }

    uint8_t payload[512];
    int pos = 0;

    payload[pos++] = (uint8_t)type_id;
    payload[pos++] = (uint8_t)location;
    payload[pos++] = (uint8_t)module_id;
    payload[pos++] = (uint8_t)col;
    payload[pos++] = (uint8_t)row;
    payload[pos++] = (uint8_t)(color & 0xff); /* colour */
    payload[pos++] = 0x00; /* upRate */
    payload[pos++] = 0x00; /* isLed */

    for (int m = 0; m < num_modes; m++)
        payload[pos++] = (uint8_t)(mode_vals ? mode_vals[m] : 0);

    if (name && *name) {
        size_t nlen = strlen(name);
        memcpy(payload + pos, name, nlen + 1);
        pos += (int)nlen + 1;
    } else {
        payload[pos++] = 0x00;
    }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    if (send_slot(slot, version, 0x30, payload, pos) < 0) {
        g2_err("add-module: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_color(int slot, int location, int module_id, int color) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)          { g2_err("set-module-color: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1)  { g2_err("set-module-color: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (color < 0 || color > 24)       { g2_err("set-module-color: color must be 0-24\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-color: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    uint8_t extra[3] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)color };
    if (send_slot(slot, version, 0x31, extra, 3) < 0) {
        g2_err("set-module-color: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_label(int slot, int location, int module_id, const char *label) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)         { g2_err("set-module-name: invalid slot\n");   return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-module-name: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (!label || !*label)            { g2_err("set-module-name: label must be non-empty\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-module-name: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    size_t nlen = strlen(label);
    if (nlen > 16) nlen = 16;

    uint8_t payload[20];
    payload[0] = (uint8_t)location;
    payload[1] = (uint8_t)module_id;
    memcpy(payload + 2, label, nlen);
    payload[2 + nlen] = 0x00;

    if (send_slot(slot, version, 0x33, payload, (int)(3 + nlen)) < 0) {
        g2_err("set-module-name: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_param_label(int slot, int location, int module_id, int param_idx, int label_idx, const char *label) {
    uint8_t response[16] = {0};

    if (slot < 0 || slot > 3)         { g2_err("set-param-label: invalid slot\n"); return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("set-param-label: location must be 0(fx) or 1(va)\n"); return G2_ERR_INVALID_PARAM; }
    if (label_idx < 0 || label_idx > 127) { g2_err("set-param-label: label_idx out of range\n"); return G2_ERR_INVALID_PARAM; }
    if (!label || !*label)             { g2_err("set-param-label: label must be non-empty\n"); return G2_ERR_INVALID_PARAM; }

    if (ensure_connected(0) < 0) { g2_err("set-param-label: failed to connect\n"); return G2_ERR_CONNECT; }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);

    int num_labels = label_idx + 1;
    int module_len = 3 + 7 * num_labels;
    int param_len  = 1 + 7 * num_labels;
    int payload_len = 6 + 7 * num_labels;

    uint8_t payload[6 + 7 * 128];
    int idx = 0;
    payload[idx++] = (uint8_t)location;
    payload[idx++] = (uint8_t)module_id;
    payload[idx++] = (uint8_t)module_len;
    payload[idx++] = 1;
    payload[idx++] = (uint8_t)param_len;
    payload[idx++] = (uint8_t)param_idx;

    for (int i = 0; i < label_idx; i++)
        for (int j = 0; j < 7; j++) payload[idx++] = 0;

    size_t llen = strlen(label);
    if (llen > 7) llen = 7;
    for (int j = 0; j < 7; j++)
        payload[idx++] = (j < (int)llen) ? (uint8_t)label[j] : 0;

    if (send_slot(slot, version, 0x42, payload, payload_len) < 0) {
        g2_err("set-param-label: failed to send\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_module_mode(int slot, int location, int module_id, int param, int val) {
    uint8_t response[16] = {0};

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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD_MS);
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

int g2_set_perf_mode(int mode) {
    if (mode < 0 || mode > 1) { g2_err("set-perf-mode: mode must be 0(performance) or 1(patch)\n"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-perf-mode: failed to connect\n"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t cmd[3] = { 0x3E, (uint8_t)mode, 0x00 };
    if (send_system_data(0x41, cmd, 3) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    uint8_t response[16] = {0};
    int ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG_MS);
    if (ret <= 0) { g2_err("No response from G2 for set-perf-mode\n"); return G2_ERR; }
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
    cmd[pos++] = 0;

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
     * Use filename (without extension) as the patch name, like g2ctl.py does. */
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
     * Version byte 0x53 is hardcoded for S_SET_PATCH (confirmed by Delphi editor and g2ctl.py).
     * Name field is variable length: name chars + null byte (matches g2ctl.py format_name). */
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

