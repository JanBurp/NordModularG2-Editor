/*
 * G2 CLI - Device implementation
 * Based on usbComms.c from G2-Edit
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include "defs.h"
#include "g2_device.h"
#include "utils.h"
#include "cJSON.h"
#include "g2_usb_internal.h"

/* ── Shared command helpers ────────────────────────────────────────────── */

static int validate_slot_location(int slot, int location, const char *fn) {
    if (slot < 0 || slot > 3)         { g2_err("%s: invalid slot", fn);                    return G2_ERR_INVALID_PARAM; }
    if (location < 0 || location > 1) { g2_err("%s: location must be 0(fx) or 1(va)", fn); return G2_ERR_INVALID_PARAM; }
    return G2_OK;
}

static int send_slot_command(int slot, uint8_t version, uint8_t subcmd,
                              const uint8_t *extra, size_t extra_len, const char *fn) {
    uint8_t response[16] = {0};
    if (send_slot(slot, version, subcmd, extra, extra_len) < 0) {
        g2_err("%s: failed to send", fn);
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    g2_drain_pending();
    return G2_OK;
}

/* ── Settings parser ───────────────────────────────────────────────────── */

cJSON *g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                          const uint8_t *perfData, size_t perfSize) {
    (void)bulkSize;

    char synthName[32] = {0};
    char perfName[32] = {0};
    char slotNames[4][17] = {{0}};
    int slotBanks[4] = {0};
    int slotPatches[4] = {0};
    int slotActive[4] = {0};
    int slotKey[4] = {0};
    int slotHold[4] = {0};
    int slotLow[4] = {0};
    int slotHigh[4] = {0};
    int mode = 0;
    int midiCh[5] = {0};
    int sysexId = 0;
    int localOn = 0;
    int prgch = 0;
    int clkSend = 0;
    int clkRecv = 0;
    int tuneSemi = 0;
    int tuneCent = 0;
    int pedalPolarity = 0;
    int pedalGain = 0;
    int focusSlot = 0;
    int rangeEnable = 0;
    int bpm = 0;
    int clockRun = 0;
    int split = 0;
    int nameLen;

    parse_name(bulkData + 4, synthName, sizeof(synthName));

    /* Verified offsets from raw device dump:
     * Offset 13 bit7: mode  Offset 17-21: MIDI channels  Offset 22: sysex
     * Offset 23 bit7: local  Offset 24: prgch  Offset 25: clk  Offset 28: tuneCent
     * Offset 30: tuneSemi  Offset 32: pedalPolarity  Offset 34: pedalGain */
    mode          = (bulkData[13] >> 7) & 1;
    midiCh[0]     = bulkData[17] + 1;
    midiCh[1]     = bulkData[18] + 1;
    midiCh[2]     = bulkData[19] + 1;
    midiCh[3]     = bulkData[20] + 1;
    midiCh[4]     = bulkData[21] + 1;
    sysexId       = bulkData[22];
    localOn       = (bulkData[23] >> 7) & 1;
    prgch         = ((bulkData[24] >> 0) & 1) | (((bulkData[24] >> 1) & 1) << 1);
    clkSend       = !((bulkData[25] >> 1) & 1);
    clkRecv       = bulkData[25] & 1;
    tuneCent      = bulkData[28];
    tuneSemi      = bulkData[30];
    pedalPolarity = bulkData[32] & 1;
    pedalGain     = bulkData[34];

    if (perfData[0] != 0) parse_name(perfData + 4, perfName, sizeof(perfName));

    const uint8_t *remaining = perfData + 4;
    char tmpName[32];
    nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;

    const uint8_t *perfSettings = remaining + 4;
    uint32_t word = ((uint32_t)perfSettings[0] << 24) | ((uint32_t)perfSettings[1] << 16) |
                    ((uint32_t)perfSettings[2] << 8) | perfSettings[3];
    focusSlot   = (word >> (32 - 4 - 2)) & 0x3;
    rangeEnable = remaining[5];
    bpm         = remaining[6];
    split       = remaining[7] & 1;
    clockRun    = remaining[8] & 1;

    const uint8_t *slotPtr = remaining + 11;
    const uint8_t *perfEnd = perfData + perfSize;

    for (int i = 0; i < 4; i++) {
        if (slotPtr >= perfEnd) break;
        int maxName = (int)(perfEnd - slotPtr);
        if (maxName > 17) maxName = 17;
        nameLen = parse_name(slotPtr, slotNames[i], maxName);
        slotPtr += nameLen;
        if (slotPtr + 7 > perfEnd) break;
        slotActive[i]  = slotPtr[0] & 1;
        slotKey[i]     = slotPtr[1] & 1;
        slotHold[i]    = slotPtr[2] & 1;
        slotBanks[i]   = slotPtr[3];
        slotPatches[i] = slotPtr[4];
        slotLow[i]     = slotPtr[5];
        slotHigh[i]    = slotPtr[6];
        slotPtr += 10;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "synthName", synthName);
    cJSON_AddStringToObject(root, "mode", mode ? "Performance" : "Patch");

    cJSON *midi = cJSON_CreateObject();
    cJSON *midiSlots = cJSON_CreateObject();
    cJSON_AddNumberToObject(midiSlots, "a", midiCh[0]);
    cJSON_AddNumberToObject(midiSlots, "b", midiCh[1]);
    cJSON_AddNumberToObject(midiSlots, "c", midiCh[2]);
    cJSON_AddNumberToObject(midiSlots, "d", midiCh[3]);
    cJSON_AddNumberToObject(midiSlots, "global", midiCh[4]);
    cJSON_AddItemToObject(midi, "slots", midiSlots);
    cJSON_AddNumberToObject(midi, "sysex", sysexId + 1);
    cJSON_AddBoolToObject(midi, "local", localOn);
    static const char *prgch_str[] = { "off", "send", "recv", "both" };
    cJSON_AddStringToObject(midi, "prgch", prgch_str[prgch & 0x3]);
    cJSON_AddBoolToObject(midi, "clkse", clkSend);
    cJSON_AddBoolToObject(midi, "clkre", clkRecv);
    cJSON_AddItemToObject(root, "midi", midi);

    cJSON *tuning = cJSON_CreateObject();
    cJSON_AddNumberToObject(tuning, "semi", tuneSemi);
    cJSON_AddNumberToObject(tuning, "cent", tuneCent);
    cJSON_AddItemToObject(root, "tuning", tuning);

    cJSON *pedal = cJSON_CreateObject();
    cJSON_AddBoolToObject(pedal, "polarity", pedalPolarity);
    cJSON_AddNumberToObject(pedal, "gain", 1.0 + 0.5 * pedalGain / 32.0);
    cJSON_AddItemToObject(root, "pedal", pedal);

    cJSON *perf = cJSON_CreateObject();
    const char *perfNameToUse = mode ? perfName : slotNames[focusSlot];
    cJSON_AddStringToObject(perf, "name", perfNameToUse);
    cJSON_AddStringToObject(perf, "focus", (char*[]){ "a", "b", "c", "d" }[focusSlot]);
    cJSON_AddBoolToObject(perf, "rangeEnable", rangeEnable);
    cJSON_AddNumberToObject(perf, "bpm", bpm);
    cJSON_AddBoolToObject(perf, "clockRunning", clockRun);
    cJSON_AddBoolToObject(perf, "kbSplit", split);
    cJSON_AddItemToObject(root, mode ? "performance" : "patches", perf);

    cJSON *slots = cJSON_CreateArray();
    for (int i = 0; i < 4; i++) {
        cJSON *slot = cJSON_CreateObject();
        cJSON_AddStringToObject(slot, "slot", (char*[]){ "a", "b", "c", "d" }[i]);
        cJSON_AddNumberToObject(slot, "bank", slotBanks[i]);
        cJSON_AddNumberToObject(slot, "patch", slotPatches[i]);
        cJSON_AddStringToObject(slot, "name", slotNames[i]);
        cJSON_AddBoolToObject(slot, "active", slotActive[i]);
        cJSON_AddBoolToObject(slot, "key", slotKey[i]);
        cJSON_AddBoolToObject(slot, "hold", slotHold[i]);
        cJSON *range = cJSON_CreateObject();
        cJSON_AddNumberToObject(range, "lower", slotLow[i]);
        cJSON_AddNumberToObject(range, "upper", slotHigh[i]);
        cJSON_AddItemToObject(slot, "range", range);
        cJSON_AddItemToArray(slots, slot);
    }
    cJSON_AddItemToObject(root, "slots", slots);

    return root;
}

/* ── Query commands ────────────────────────────────────────────────────── */

cJSON *g2_device_info(int debug) {
    uint8_t response[8192] = {0};
    uint8_t *bulkData = NULL;
    uint8_t *perfData = NULL;
    size_t bulkSize = 0;
    size_t perfSize = 0;
    int ret;
    uint8_t msgType;
    uint16_t size;

    if (ensure_connected(1) < 0) { g2_err("Failed to connect to G2\n"); return NULL; }

    g2_drain_pending();

    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        g2_err("Failed to send synth settings command\n");
        return NULL;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) { g2_err("No response from G2\n"); return NULL; }

    msgType = response[0] & 0x0f;
    if (msgType != RESPONSE_TYPE_EXTENDED) { g2_err("Unexpected response type %d\n", msgType); return NULL; }

    size = (response[1] << 8) | response[2];
    bulkData = malloc(size);
    if (!bulkData) { g2_err("Memory allocation failed\n"); return NULL; }
    bulkSize = size;

    if (recv_bulk(bulkData, size) <= 0) { g2_err("Failed to read bulk data\n"); free(bulkData); return NULL; }

    if (debug) {
        fprintf(stderr, "SYNTH:%zu:", bulkSize);
        for (size_t j = 0; j < bulkSize; j++) fprintf(stderr, "%02x", bulkData[j]);
        fprintf(stderr, "\n");
    }

    uint8_t selsData[1024] = {0};
    uint8_t selsInterrupt[16] = {0};
    if (send_system(0x41, 0x81) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD);
        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    perfData = malloc(1024);
    if (!perfData) { g2_err("Memory allocation failed\n"); free(bulkData); return NULL; }

    uint8_t perfInterrupt[16] = {0};
    if (send_system(selsData[2], 0x10) == 0) {
        usleep(USB_SEND_DELAY_US);
        ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_STANDARD);
        if (ret > 0 && (perfInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (perfInterrupt[1] << 8) | perfInterrupt[2];
            perfSize = size;
            recv_bulk(perfData, size);
        }
    }

    if (debug) {
        fprintf(stderr, "PERF:%zu:", perfSize);
        for (size_t j = 0; j < perfSize; j++) fprintf(stderr, "%02x", perfData[j]);
        fprintf(stderr, "\n");
    }

    cJSON *root = g2_parse_settings(bulkData, bulkSize, perfData, perfSize);
    free(bulkData);
    free(perfData);
    if (!root) { g2_err("Failed to parse settings\n"); return NULL; }
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

    if (ensure_connected(1) < 0) { g2_err("Failed to connect to G2\n"); return NULL; }

    if (slot_str == NULL) { g2_err("Slot required (A, B, C, or D)\n"); goto cleanup; }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) { g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str); goto cleanup; }
    actual_slot = slot;

    {
        uint8_t stale[16]; int n, stale_count = 0;
        while ((n = recv_interrupt(stale, sizeof(stale), 20)) > 0) {
            stale_count++;
            if ((stale[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
                uint16_t sz = ((uint16_t)stale[1] << 8) | stale[2];
                if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
            }
        }
        (void)stale_count;
    }

    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        g2_err("Failed to send get patch version command\n");
        goto cleanup;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) { g2_err("No response from G2 for patch version\n"); goto cleanup; }
    version = interruptResp[6];

    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        g2_err("Failed to send get patch command\n");
        goto cleanup;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) { g2_err("No interrupt response for patch data\n"); goto cleanup; }
    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    patchData = malloc(patchSize);
    if (!patchData) { g2_err("Memory allocation failed\n"); goto cleanup; }
    ret = recv_bulk(patchData, patchSize);
    if (ret <= 0) { g2_err("Failed to read patch bulk data\n"); free(patchData); patchData = NULL; goto cleanup; }

    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        free(patchData);
        goto cleanup;
    }
    usleep(100000);
    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_LONG);
    if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
        parse_name(interruptResp + 5, patchName, sizeof(patchName));
    } else if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t size = (interruptResp[1] << 8) | interruptResp[2];
        uint8_t *nameData = malloc(size);
        if (nameData) {
            int bulkLen = recv_bulk(nameData, size);
            if (bulkLen > 4) parse_name(nameData + 4, patchName, sizeof(patchName));
            free(nameData);
        }
    }

    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (pch2Data && patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) == 0) {
        free(patchData);
        patchData = pch2Data;
        patchSize = (uint16_t)pch2Size;
    } else {
        free(pch2Data);
    }

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "slot", (char*[]){ "a", "b", "c", "d" }[slot]);
    cJSON_AddStringToObject(root, "name", patchName);
    cJSON_AddNumberToObject(root, "size", patchSize);

    char *hexStr = malloc(patchSize * 2 + 1);
    if (hexStr) {
        for (size_t i = 0; i < patchSize; i++) sprintf(hexStr + i * 2, "%02x", patchData[i]);
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

    if (ensure_connected(1) < 0) { g2_err("Failed to connect to G2\n"); return NULL; }
    if (slot_str == NULL) { g2_err("Slot required (A, B, C, or D)\n"); goto cleanup; }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) { g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str); goto cleanup; }
    actual_slot = slot;

    g2_err("Fetching patch from slot %c...\n", "ABCD"[slot]);

    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        g2_err("Failed to send get patch version command\n");
        goto cleanup;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) { g2_err("No response from G2 for patch version\n"); goto cleanup; }
    version = interruptResp[6];

    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        g2_err("Failed to send get patch command\n");
        goto cleanup;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) { g2_err("No interrupt response for patch data\n"); goto cleanup; }
    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    patchData = malloc(patchSize);
    if (!patchData) { g2_err("Memory allocation failed\n"); goto cleanup; }
    ret = recv_bulk(patchData, patchSize);
    if (ret <= 0) { g2_err("Failed to read patch bulk data\n"); goto cleanup; }

    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        g2_err("Failed to send get patch name command\n");
        goto cleanup;
    }
    usleep(100000);
    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_LONG);
    if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
        parse_name(interruptResp + 5, patchName, sizeof(patchName));
    } else if (ret > 0 && (interruptResp[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
        uint16_t size = (interruptResp[1] << 8) | interruptResp[2];
        uint8_t *nameData = malloc(size);
        if (nameData) {
            int bulkLen = recv_bulk(nameData, size);
            if (bulkLen > 4) parse_name(nameData + 4, patchName, sizeof(patchName));
            free(nameData);
        }
    }

    char defaultFilename[64];
    if (filename == NULL) {
        if (strlen(patchName) == 0)
            snprintf(defaultFilename, sizeof(defaultFilename), "slot_%c.pch2", "ABCD"[slot]);
        else
            snprintf(defaultFilename, sizeof(defaultFilename), "%s.pch2", patchName);
        filename = defaultFilename;
    }

    uint8_t *pch2Data = malloc(patchSize);
    size_t pch2Size = patchSize;
    if (!pch2Data) { g2_err("Memory allocation failed for PCH2 conversion\n"); goto cleanup; }
    if (patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) < 0) {
        g2_err("Failed to convert patch to PCH2 format\n");
        free(pch2Data);
        goto cleanup;
    }

    FILE *f = fopen(filename, "wb");
    if (!f) { g2_err("Failed to open file '%s' for writing\n", filename); free(pch2Data); goto cleanup; }
    size_t written = fwrite(pch2Data, 1, pch2Size, f);
    fclose(f);
    free(pch2Data);
    if (written != pch2Size) { g2_err("Failed to write complete file\n"); goto cleanup; }

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
    if (g2_send_init() != G2_OK) return NULL;

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

/* ── Slot / variation commands ─────────────────────────────────────────── */

int g2_select_slot(const char *slot_str) {
    int slot;
    uint8_t response[16] = {0};
    uint8_t version;
    uint8_t mask;
    uint8_t data[8] = {0};

    if (ensure_connected(0) < 0) { g2_err("Failed to connect to G2\n"); return G2_ERR_CONNECT; }

    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) { g2_err("Invalid slot: %s (use A, B, C, or D)\n", slot_str); return G2_ERR_INVALID_PARAM; }

    g2_drain_pending();

    {
        uint8_t pv_cmd[2] = {SUB_COMMAND_GET_PATCH_VERSION, 4};
        uint8_t pv_resp[16] = {0};
        send_system_data(0x41, pv_cmd, 2);
        usleep(USB_SEND_DELAY_US);
        int pv_ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD);
        version = (pv_ret > 0 && pv_resp[6]) ? pv_resp[6] : 0x41;
    }

    mask = 0x08 >> slot;
    data[0] = 0x07; data[1] = mask; data[2] = 0x0f; data[3] = mask;
    if (send_system_data(version, data, 4) < 0) { g2_err("Failed to send slot command 1\n"); return G2_ERR_SEND; }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);

    data[0] = 0x09; data[1] = slot;
    if (send_system_data(version, data, 2) < 0) { g2_err("Failed to send slot command 2\n"); return G2_ERR_SEND; }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    g2_drain_pending();

    if (send_slot(slot, 0x0a, 0x70, NULL, 0) < 0) { g2_err("Failed to send slot command 3\n"); return G2_ERR_SEND; }
    {
        int n = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
        if (n > 0 && (response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)response[1] << 8) | response[2];
            if (sz > 0) { uint8_t *bulk = malloc(sz); if (bulk) { recv_bulk(bulk, sz); free(bulk); } }
        }
    }
    g2_drain_pending();
    return G2_OK;
}

/* G2 Categories */
static const char *g2categories[16] = {
    "no_cat", "acoustic", "sequencer", "bass", "classic", "drum",
    "fantasy", "fx", "lead", "organ", "pad", "piano", "synth",
    "audio_in", "user_1", "user_2"
};

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

    if (ensure_connected(1) < 0) { g2_err("Not connected to G2\n"); return NULL; }

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

    if (filter == LIST_FILTER_ALL)          { start_mode = PATCH_MODE;       end_mode = END_MODE;               }
    else if (filter == LIST_FILTER_PATCHES) { start_mode = PATCH_MODE;       end_mode = PATCH_MODE + 1;         }
    else                                    { start_mode = PERFORMANCE_MODE; end_mode = PERFORMANCE_MODE + 1;   }

    for (mode = start_mode; mode < end_mode && !done; mode++) {
        bank = initial_bank;
        patch = 0;

        while (mode < END_MODE && !done) {
            cmdData[0] = 0x14; cmdData[1] = (uint8_t)mode;
            cmdData[2] = (uint8_t)bank; cmdData[3] = (uint8_t)patch;

            if (send_system_data(0x41, cmdData, 4) < 0) {
                g2_err("Failed to send list command\n");
                cJSON_Delete(root);
                return NULL;
            }

            ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
            if (ret <= 0) ret = recv_bulk(response, sizeof(response));
            if (ret <= 9) break;

            int data_len = ret - 9 - 2;
            if (data_len <= 0) break;

            uint8_t *data = response + 9;
            int pos = 0;

            while (pos < data_len) {
                uint8_t c = data[pos];
                if (c > LIST_LAST) {
                    char name[32] = {0};
                    int nameLen = parse_name(data + pos, name, sizeof(name));
                    if (nameLen <= 0 || pos + nameLen >= data_len) break;

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
                        const char *key = (mode == PATCH_MODE) ? "patches" : "performances";
                        bankArray = cJSON_GetObjectItem(cJSON_GetObjectItem(root, key), bankKey);
                        if (!bankArray) {
                            bankArray = cJSON_CreateArray();
                            cJSON_AddItemToObject(cJSON_GetObjectItem(root, key), bankKey, bankArray);
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
                        if (bank_filter_active && new_bank != bank) { done = 1; break; }
                        bank = new_bank;
                        pos += 3;
                    } else { break; }
                } else if (c == LIST_JUMP) {
                    if (pos + 2 <= data_len) { patch = data[pos + 1]; pos += 2; }
                    else { break; }
                } else if (c == LIST_SKIP) {
                    patch++; pos++;
                } else if (c == LIST_MODE) {
                    mode++; bank = 0; patch = 0; pos++;
                    if (filter != LIST_FILTER_ALL) done = 1;
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

    if (variation < 1 || variation > 8) { g2_err("Invalid variation: %d (must be 1-8)\n", variation); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("Failed to connect to G2\n"); return G2_ERR_CONNECT; }
    if (slot < 0 || slot > 3) { g2_err("Slot required (A, B, C, or D)\n"); return G2_ERR_INVALID_PARAM; }

    g2_drain_pending();

    uint8_t cmdData[2] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) { g2_err("Failed to send variation command 1\n"); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt_with_retry(slota, 16, USB_TIMEOUT_STANDARD, 5);
    if (ret <= 0) { g2_err("No response from G2 for variation command 1\n"); return G2_ERR_RECV; }
    uint8_t version = slota[6];

    uint8_t extraData[1] = { (uint8_t)(variation - 1) };
    if (send_slot(slot, version, 0x6a, extraData, 1) < 0) { g2_err("Failed to send variation command 2\n"); return G2_ERR_SEND; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt_with_retry(response, 16, USB_TIMEOUT_STANDARD, 5);
    return (ret > 0) ? G2_OK : G2_ERR_RECV;
}

/* ── Module / cable commands ───────────────────────────────────────────── */

static uint8_t cable_get_version(int slot) {
    uint8_t slota[16] = {0};
    uint8_t cmdData[2] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) return 0;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(slota, sizeof(slota), USB_TIMEOUT_STANDARD);
    return slota[6];
}

int g2_add_cable(int slot, int location, int color,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    int ret = validate_slot_location(slot, location, "add-cable");
    if (ret != G2_OK) return ret;
    if (color < 0 || color > 6) { g2_err("add-cable: color must be 0-6"); return G2_ERR_INVALID_PARAM; }
    if (from_con_type < 0 || to_con_type < 0) { g2_err("add-cable: connector type must be 0(in) or 1(out)"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("add-cable: failed to connect"); return G2_ERR_CONNECT; }

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
    return send_slot_command(slot, version, 0x50, extra, 5, "add-cable");
}

int g2_del_cable(int slot, int location,
                 int from_mod, int from_con_type, int from_con_id,
                 int to_mod,   int to_con_type,   int to_con_id) {
    int ret = validate_slot_location(slot, location, "del-cable");
    if (ret != G2_OK) return ret;
    if (from_con_type < 0 || to_con_type < 0) { g2_err("del-cable: connector type must be 0(in) or 1(out)"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("del-cable: failed to connect"); return G2_ERR_CONNECT; }

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
    return send_slot_command(slot, version, 0x51, extra, 5, "del-cable");
}

int g2_del_module(int slot, int location, int module_id) {
    int ret = validate_slot_location(slot, location, "del-module");
    if (ret != G2_OK) return ret;
    if (ensure_connected(0) < 0) { g2_err("del-module: failed to connect"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t extra[2] = { (uint8_t)location, (uint8_t)module_id };
    return send_slot_command(slot, version, 0x32, extra, 2, "del-module");
}

int g2_move_module(int slot, int location, int module_id, int col, int row) {
    int ret = validate_slot_location(slot, location, "move-module");
    if (ret != G2_OK) return ret;
    if (ensure_connected(0) < 0) { g2_err("move-module: failed to connect"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t extra[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)col, (uint8_t)row };
    return send_slot_command(slot, version, 0x34, extra, 4, "move-module");
}

int g2_add_module(int slot, int location, int type_id, int module_id,
                  int col, int row, int color,
                  int num_modes, const int *mode_vals,
                  int num_params, const int *param_vals,
                  const char *name) {
    (void)num_params; (void)param_vals;

    int ret = validate_slot_location(slot, location, "add-module");
    if (ret != G2_OK) return ret;
    if (ensure_connected(0) < 0) { g2_err("add-module: failed to connect"); return G2_ERR_CONNECT; }

    uint8_t payload[512];
    int pos = 0;
    payload[pos++] = (uint8_t)type_id;
    payload[pos++] = (uint8_t)location;
    payload[pos++] = (uint8_t)module_id;
    payload[pos++] = (uint8_t)col;
    payload[pos++] = (uint8_t)row;
    payload[pos++] = (uint8_t)(color & 0xff);
    payload[pos++] = 0x00;
    payload[pos++] = 0x00;
    for (int m = 0; m < num_modes; m++) payload[pos++] = (uint8_t)(mode_vals ? mode_vals[m] : 0);
    if (name && *name) {
        size_t nlen = strlen(name);
        memcpy(payload + pos, name, nlen + 1);
        pos += (int)nlen + 1;
    } else {
        payload[pos++] = 0x00;
    }

    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    return send_slot_command(slot, version, 0x30, payload, pos, "add-module");
}

int g2_set_module_color(int slot, int location, int module_id, int color) {
    int ret = validate_slot_location(slot, location, "set-module-color");
    if (ret != G2_OK) return ret;
    if (color < 0 || color > 24) { g2_err("set-module-color: color must be 0-24"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-module-color: failed to connect"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t extra[3] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)color };
    return send_slot_command(slot, version, 0x31, extra, 3, "set-module-color");
}

int g2_set_module_label(int slot, int location, int module_id, const char *label) {
    int ret = validate_slot_location(slot, location, "set-module-name");
    if (ret != G2_OK) return ret;
    if (!label || !*label) { g2_err("set-module-name: label must be non-empty"); return G2_ERR_INVALID_PARAM; }
    if (ensure_connected(0) < 0) { g2_err("set-module-name: failed to connect"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    size_t nlen = strlen(label);
    if (nlen > 16) nlen = 16;
    uint8_t payload[20];
    payload[0] = (uint8_t)location;
    payload[1] = (uint8_t)module_id;
    memcpy(payload + 2, label, nlen);
    payload[2 + nlen] = 0x00;
    return send_slot_command(slot, version, 0x33, payload, 3 + nlen, "set-module-name");
}

int g2_set_module_mode(int slot, int location, int module_id, int param, int val) {
    int ret = validate_slot_location(slot, location, "set-module-mode");
    if (ret != G2_OK) return ret;
    if (ensure_connected(0) < 0) { g2_err("set-module-mode: failed to connect"); return G2_ERR_CONNECT; }
    g2_drain_pending();
    uint8_t version = cable_get_version(slot);
    uint8_t extra[4] = { (uint8_t)location, (uint8_t)module_id, (uint8_t)param, (uint8_t)val };
    return send_slot_command(slot, version, 0x2B, extra, 4, "set-module-mode");
}

/* ── Patch browser / upload / param ───────────────────────────────────── */

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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG);
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

    const char *base = strrchr(filepath, '/');
    base = base ? base + 1 : filepath;
    char name[16] = {0};
    int ni = 0;
    while (ni < 15 && base[ni] && base[ni] != '.') { name[ni] = base[ni]; ni++; }

    int name_end = 0;
    while (name_end < fsize && file_data[name_end]) name_end++;
    int data_offset = name_end + 3;
    int data_len = (int)fsize - data_offset - 2;
    if (data_len <= 0) { free(file_data); return G2_ERR_PARSE; }

    int name_write_len = ni + 1;
    size_t extraLen = 3 + (size_t)name_write_len + (size_t)data_len;
    size_t totalLen = COMMAND_OFFSET + 4 + extraLen + 2;
    uint8_t *buff = (uint8_t *)calloc(1, totalLen);
    if (!buff) { free(file_data); return G2_ERR_NO_MEMORY; }

    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = 0x53;
    buff[pos++] = SUB_COMMAND_SET;
    pos += 3;
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
    int ret = g2_send_command(buff, msgLength);
    free(buff);
    if (ret < 0) return G2_ERR_SEND;

    usleep(USB_SEND_DELAY_US * 5);
    uint8_t response[64] = {0};
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_LONG);
    g2_drain_pending();
    return G2_OK;
}

int g2_set_param(int slot, int location, int module_id,
                 int param_idx, int value, int variation) {
    if (slot < 0 || slot > 3)         return G2_ERR_INVALID_PARAM;
    if (location < 0 || location > 1) return G2_ERR_INVALID_PARAM;
    if (ensure_connected(0) < 0)      return G2_ERR_CONNECT;

    uint8_t version = cable_get_version(slot);

    uint8_t buff[2048] = {0};
    int pos = COMMAND_OFFSET;
    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_WRITE_NO_RESP | COMMAND_SLOT | (uint8_t)slot;
    buff[pos++] = version;
    buff[pos++] = 0x40;
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

    return (g2_send_command(buff, msgLength) < 0) ? G2_ERR_SEND : G2_OK;
}

/* ── Watch ─────────────────────────────────────────────────────────────── */

g2_watch_state_t g2_watch_cfg = { .running = 1, .verbose = 1, .tick_hook = NULL };

void g2_watch_stop(int sig) {
    (void)sig;
    g2_watch_cfg.running = 0;
}

int g2_watch_disarm(void) {
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    g2_drain_pending();
    return G2_OK;
}

int g2_watch_rearm(void) {
    uint8_t response[16];
    g2_drain_pending();
    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    if (send_system_data(0x41, start_cmd, 2) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    return G2_OK;
}

#define BULK_REARM 1

static int process_bulk_event(const uint8_t *bulk, int bret) {
    if (bret <= 6) return 0;
    uint8_t baCmd    = bulk[1];
    uint8_t bversion = bulk[2];
    uint8_t bsubCmd  = bulk[3];
    int dataEnd      = bret - 2;

    if (baCmd == 0x04 && bversion == 0x40 && bsubCmd == 0x1f) {
        printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
        fflush(stdout);
        return BULK_REARM;
    }

    if (baCmd == 0x04) {
        if (bsubCmd == 0x29) {
            char name[17] = {0};
            int n = 0;
            for (int i = 4; i < dataEnd && n < 16 && bulk[i]; i++) name[n++] = (char)bulk[i];
            printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
            fflush(stdout);
        } else if (bsubCmd == 0x11) {
            printf("{\"type\":\"perf_settings\"}\n");
            fflush(stdout);
        }
    } else if (baCmd <= 0x03) {
        uint8_t bslot = baCmd;
        switch (bsubCmd) {
            case 0x39:
                if (g2_watch_cfg.verbose) {
                    printf("{\"type\":\"led_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x3A:
                if (g2_watch_cfg.verbose) {
                    printf("{\"type\":\"volume_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x72:
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout);
                break;
        }
    }
    return 0;
}

int g2_watch(output_format_t format, int debug) {
    uint8_t response[16] = {0};
    int ret;
    (void)format;

    if (ensure_connected(1) < 0) { g2_err("watch: failed to connect\n"); return G2_ERR_CONNECT; }

    signal(SIGINT, g2_watch_stop);
    signal(SIGTERM, g2_watch_stop);

    g2_drain_pending();
    g2_clear_halts();

    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    ret = send_system_data(0x41, start_cmd, 2);
    if (ret < 0) { g2_err("watch: failed to send StartComm\n"); return G2_ERR; }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    printf("{\"type\":\"watch_armed\"}\n");
    fflush(stdout);

    if (ret <= 0) {
        printf("{\"type\":\"device_bad_state\"}\n");
        fflush(stdout);
        g2_disconnect();
        while (g2_watch_cfg.running) {
            if (g2_connect_silent() >= 0) break;
            usleep(100000);
        }
        if (!g2_watch_cfg.running) return G2_OK;
        g2_drain_pending();
        g2_clear_halts();
        ret = send_system_data(0x41, start_cmd, 2);
        if (ret < 0) { g2_err("watch: failed to re-arm after bad state\n"); return G2_ERR; }
        usleep(USB_SEND_DELAY_US);
        recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
        printf("{\"type\":\"device_reconnected\"}\n");
        fflush(stdout);
    }

    while (g2_watch_cfg.running) {
        if (g2_watch_cfg.tick_hook) g2_watch_cfg.tick_hook();
        ret = recv_interrupt(response, sizeof(response), 100);
        if (ret == LIBUSB_ERROR_NO_DEVICE) {
            printf("{\"type\":\"device_disconnected\"}\n");
            fflush(stdout);
            g2_disconnect();

            while (g2_watch_cfg.running) {
                if (g2_connect_silent() >= 0) break;
                usleep(100000);
            }
            if (!g2_watch_cfg.running) break;

            g2_drain_pending();
            uint8_t start_cmd2[2] = {SUB_COMMAND_START_STOP, 0x00};
            ret = send_system_data(0x41, start_cmd2, 2);
            if (ret < 0) { g2_err("watch: failed to re-arm after reconnect\n"); break; }
            usleep(USB_SEND_DELAY_US);
            recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
                            uint8_t arm[2] = {SUB_COMMAND_START_STOP, 0x00};
                            uint8_t arm_ack[16];
                            send_system_data(0x41, arm, 2);
                            recv_interrupt(arm_ack, sizeof(arm_ack), USB_TIMEOUT_STANDARD);
                        }
                    }
                    free(bulk);
                }
            }
            continue;
        }

        if (msgType != RESPONSE_TYPE_EMBEDDED) continue;

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
                        printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n", response[5], response[6]);
                        break;
                    default: {
                        char hex[32] = "";
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++) snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
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
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++) snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                        printf("{\"type\":\"unknown_sys\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                        break;
                    }
                }
            }
            fflush(stdout);
            continue;
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
                    for (int i = 5; i <= lastByte && n < 16 && response[i]; i++) name[n++] = (char)response[i];
                    printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
                    break;
                }
                case 0x11:
                case 0x10:
                    printf("{\"type\":\"perf_settings_update\"}\n");
                    break;
                case 0x3F:
                    if (response[6] == 0x00) printf("{\"type\":\"master_clock_run\",\"run\":%u}\n", response[7]);
                    else                     printf("{\"type\":\"master_clock_bpm\",\"bpm\":%u}\n", response[7]);
                    break;
                case 0x5D:
                    printf("{\"type\":\"ext_master_clock\",\"value\":%u}\n", (response[6] << 8) | response[7]);
                    break;
                case 0x80:
                    printf("{\"type\":\"midi_cc\",\"cc\":%u}\n", response[6]);
                    break;
                case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
                case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
                default: {
                    char hex[32] = "";
                    for (int i = 5; i <= lastByte && i - 5 < 15; i++) snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                    printf("{\"type\":\"unknown_perf\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                    break;
                }
            }
            fflush(stdout);
            continue;
        }

        uint8_t slot = aCmd & 0x03;

        if (version == 0x40) {
            if (subCmd == 0x36 || subCmd == 0x38)
                printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n", response[5], response[6]);
            else {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++) snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown_version\",\"slot\":%u,\"sub\":%u,\"data\":\"%s\"}\n", slot, subCmd, hex);
            }
            fflush(stdout);
            continue;
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
                for (int i = 5; i <= lastByte && n < 16 && response[i]; i++) name[n++] = (char)response[i];
                printf("{\"type\":\"patch_name\",\"slot\":%u,\"name\":\"%s\"}\n", slot, name);
                break;
            }
            case 0x44:
                printf("{\"type\":\"copy_variation\",\"slot\":%u,\"from\":%u,\"to\":%u}\n", slot, response[5], response[6]);
                break;
            case 0x6A:
                printf("{\"type\":\"variation_change\",\"slot\":%u,\"variation\":%u}\n", slot, response[5]);
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
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"location\":%u}\n", slot, response[5]);
                break;
            case 0x59:
            case 0x70:
            case 0x7F: printf("{\"type\":\"ok\",\"slot\":%u}\n", slot); break;
            case 0x7E: printf("{\"type\":\"error\",\"slot\":%u,\"code\":%u}\n", slot, response[5]); break;
            default: {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++) snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown\",\"slot\":%u,\"cmd\":%u,\"sub\":%u,\"data\":\"%s\"}\n",
                       slot, aCmd, subCmd, hex);
                break;
            }
        }
        fflush(stdout);
    }

    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    g2_drain_pending();

    signal(SIGINT, SIG_DFL);
    signal(SIGTERM, SIG_DFL);

    return 0;
}
