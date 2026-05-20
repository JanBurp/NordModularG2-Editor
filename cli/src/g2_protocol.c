/*
 * G2 CLI - Protocol parser
 *
 * Decodes the raw synth-settings and performance-settings bulk payloads
 * returned by the G2 into JSON objects. Used by g2_device.c (direct queries)
 * and g2_events.c (streamed watch events).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "defs.h"
#include "utils.h"
#include "cJSON.h"
#include "g2_protocol.h"

/* Parse the synth-settings bulk payload into a JSON object.
 * Extracts: synth name, mode (Patch/Performance), MIDI channels, clock,
 * tuning (semitones + cents), and pedal settings. */
cJSON *build_synth_bulk_json(const uint8_t *bulkData, const char *type) {
    char synthName[32] = {0};
    int nameLen = parse_name(bulkData + 4, synthName, sizeof(synthName));
    int mode          = (bulkData[4 + nameLen] >> 7) & 1;
    int midiCh[5]     = { bulkData[17]+1, bulkData[18]+1, bulkData[19]+1, bulkData[20]+1, bulkData[21]+1 };
    int sysexId       = bulkData[22];
    int localOn       = (bulkData[23] >> 7) & 1;
    int prgch         = (bulkData[24] & 1) | ((bulkData[24] >> 1) & 1) << 1;
    int clkSend       = !((bulkData[25] >> 1) & 1);
    int clkRecv       = bulkData[25] & 1;
    int tuneCent      = bulkData[28];
    int tuneSemi      = bulkData[30];
    int pedalPolarity = bulkData[32] & 1;
    int pedalGain     = bulkData[34];

    cJSON *root = cJSON_CreateObject();
    if (type) cJSON_AddStringToObject(root, "type", type);
    cJSON_AddStringToObject(root, "synthName", synthName);
    cJSON_AddStringToObject(root, "mode", mode ? "Performance" : "Patch");

    cJSON *midi = cJSON_CreateObject();
    cJSON *midiSlots = cJSON_CreateObject();
    cJSON_AddNumberToObject(midiSlots, "A", midiCh[0]);
    cJSON_AddNumberToObject(midiSlots, "B", midiCh[1]);
    cJSON_AddNumberToObject(midiSlots, "C", midiCh[2]);
    cJSON_AddNumberToObject(midiSlots, "D", midiCh[3]);
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

    return root;
}

/* Parse the performance bulk payload and attach "performance" and "slots"
 * sub-objects to an existing JSON root. mode=1 → Performance, mode=0 → Patch. */
void perf_parse_and_add(const uint8_t *perfData, size_t perfSize,
                                int mode, cJSON *root) {
    char perfName[32] = {0};
    char slotNames[4][17] = {{0}};
    int slotBanks[4] = {0}, slotPatches[4] = {0};
    int slotActive[4] = {0}, slotKey[4] = {0}, slotHold[4] = {0};
    int slotLow[4] = {0}, slotHigh[4] = {0};
    int focusSlot = 0, rangeEnable = 0, bpm = 0, clockRun = 0, split = 0;
    int nameLen;

    if (perfData[0] != 0)
        parse_name(perfData + 4, perfName, sizeof(perfName));

    const uint8_t *remaining = perfData + 4;
    char tmpName[32];
    nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    remaining += nameLen;

    const uint8_t *perfSettings = remaining + 4;
    uint32_t word = ((uint32_t)perfSettings[0] << 24) | ((uint32_t)perfSettings[1] << 16) |
                    ((uint32_t)perfSettings[2] << 8)  |  (uint32_t)perfSettings[3];
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

    cJSON *perf = cJSON_CreateObject();
    cJSON_AddStringToObject(perf, "name", mode ? perfName : slotNames[focusSlot]);
    cJSON_AddStringToObject(perf, "focus", (char*[]){ "a", "b", "c", "d" }[focusSlot]);
    cJSON_AddBoolToObject(perf, "rangeEnable", rangeEnable);
    cJSON_AddNumberToObject(perf, "bpm", bpm);
    cJSON_AddBoolToObject(perf, "clockRunning", clockRun);
    cJSON_AddBoolToObject(perf, "kbSplit", split);
    cJSON_AddItemToObject(root, mode ? "performance" : "patches", perf);

    cJSON *slots = cJSON_CreateArray();
    for (int i = 0; i < 4; i++) {
        cJSON *slot = cJSON_CreateObject();
        cJSON_AddStringToObject(slot, "slot", (char*[]){ "A", "B", "C", "D" }[i]);
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
}

cJSON *g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                         const uint8_t *perfData, size_t perfSize) {
    (void)bulkSize;
    cJSON *root = build_synth_bulk_json(bulkData, NULL);
    int mode = strcmp(cJSON_GetObjectItem(root, "mode")->valuestring, "Performance") == 0;
    perf_parse_and_add(perfData, perfSize, mode, root);
    return root;
}
