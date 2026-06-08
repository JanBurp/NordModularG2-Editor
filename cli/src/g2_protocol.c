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

/*
 * Hardware GET response: bulk[4..] holds a null-terminated name of variable length.
 * parse_name() returns nameLen = (chars + 1) including the null byte.
 * All data fields follow immediately at base = 4 + nameLen:
 *
 * base+0   PerfMode (bit 7)
 * base+1   0x00 constant
 * base+2   PerfBank
 * base+3   PerfLocation
 * base+4   MemoryProtect (bit 7)
 * base+5..9 MIDI channels A/B/C/D/Global (0-indexed)
 * base+10  SysExID (0-indexed, 16=All)
 * base+11  LocalOn (bit 7)
 * base+12  PrgCh: bit1=recv, bit0=send
 * base+13  Controllers: bit1=recv, bit0=send
 * base+14  Clock: bit6=SendClock, bit5=IgnoreExternalClock
 * base+15  TuneCent (int8_t)
 * base+16  GlobalOctaveShiftActive (bit 7)
 * base+17  GlobalOctaveShift (int8_t)
 * base+18  TuneSemi (int8_t)
 * base+19  0x00
 * base+20  PedalPolarity (bit 7)
 * base+21  ControlPedalGain (0-32)
 */

/* Cache of last-received PerfBank/PerfLocation, for preserving in SET messages */
static uint8_t g2_synth_perf_bank = 0;
static uint8_t g2_synth_perf_loc  = 0;

/* Parse the synth-settings bulk payload into a JSON object.
 * Extracts: synth name, mode (Patch/Performance), MIDI channels, clock,
 * tuning, octave shift, pedal settings, memory protect, and CC controllers. */
cJSON *build_synth_bulk_json(const uint8_t *bulkData, const char *type) {
    char synthName[32] = {0};
    int nameLen = parse_name(bulkData + 4, synthName, sizeof(synthName));
    int base    = 4 + nameLen;

    int mode       = (bulkData[base +  0] >> 7) & 1;
    int memProtect = (bulkData[base +  4] >> 7) & 1;
    int midiCh[5]  = { bulkData[base+5]+1, bulkData[base+6]+1, bulkData[base+7]+1,
                       bulkData[base+8]+1, bulkData[base+9]+1 };
    int sysexId    = bulkData[base + 10];
    int localOn    = (bulkData[base + 11] >> 7) & 1;
    int prgch      = (bulkData[base + 12] & 1) | ((bulkData[base + 12] >> 1) & 1) << 1;
    int ctrlsRecv  = (bulkData[base + 13] >> 1) & 1;
    int ctrlsSend  =  bulkData[base + 13] & 1;
    int clkSend    = (bulkData[base + 14] >> 6) & 1;
    int clkRecv    = !((bulkData[base + 14] >> 5) & 1);
    int tuneCent   = (int8_t)bulkData[base + 15];
    int gOctActive = (bulkData[base + 16] >> 7) & 1;
    int gOctShift  = (int8_t)bulkData[base + 17];
    int tuneSemi   = (int8_t)bulkData[base + 18];
    int pedalPol   = (bulkData[base + 20] >> 7) & 1;
    int pedalGain  =  bulkData[base + 21];

    /* Cache for SET message */
    g2_synth_perf_bank = bulkData[base + 2];
    g2_synth_perf_loc  = bulkData[base + 3];

    cJSON *root = cJSON_CreateObject();
    if (type) cJSON_AddStringToObject(root, "type", type);
    cJSON_AddStringToObject(root, "synthName", synthName);
    cJSON_AddStringToObject(root, "mode", mode ? "Performance" : "Patch");
    cJSON_AddNumberToObject(root, "perfBank", g2_synth_perf_bank);
    cJSON_AddNumberToObject(root, "perfLoc",  g2_synth_perf_loc);
    cJSON_AddBoolToObject(root, "memProtect", memProtect);

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
    cJSON_AddNumberToObject(midi, "prgch", prgch);
    cJSON_AddBoolToObject(midi, "ctrlsRecv", ctrlsRecv);
    cJSON_AddBoolToObject(midi, "ctrlsSend", ctrlsSend);
    cJSON_AddBoolToObject(midi, "clkse", clkSend);
    cJSON_AddBoolToObject(midi, "clkre", clkRecv);
    cJSON_AddItemToObject(root, "midi", midi);

    cJSON *tuning = cJSON_CreateObject();
    cJSON_AddNumberToObject(tuning, "semi", tuneSemi);
    cJSON_AddNumberToObject(tuning, "cent", tuneCent);
    cJSON_AddItemToObject(root, "tuning", tuning);

    cJSON_AddBoolToObject(root, "globalOctaveShiftActive", gOctActive);
    cJSON_AddNumberToObject(root, "globalOctaveShift", gOctShift);

    cJSON *pedal = cJSON_CreateObject();
    cJSON_AddBoolToObject(pedal, "polarity", pedalPol);
    cJSON_AddNumberToObject(pedal, "gain", pedalGain);
    cJSON_AddItemToObject(root, "pedal", pedal);

    return root;
}

/*
 * Build a SET synth-settings payload from JSON params.
 * Source: BVE.NMG2Mess.pas AddSetSynthSettingsMessage (WriteClaviaString).
 *
 * The name is variable-length (chars + 1 null byte), same as GET.
 * All subsequent fields are relative to base = 1 + nameLen.
 *
 * data[0]        0x03 (S_SYNTH_SETTINGS subcommand)
 * data[1..nLen]  synthName (nameLen = strlen + 1, includes null)
 * base+0         0x80 (required SET marker; Delphi always $80 regardless of mode)
 * base+1         0x00
 * base+2         PerfBank (cached from last GET)
 * base+3         PerfLocation (cached from last GET)
 * base+4         MemoryProtect (bit 7)
 * base+5..9      MIDI A/B/C/D/Global (0-indexed; JSON values are 1-indexed)
 * base+10        SysExID (0-indexed; JSON is 1-indexed, 17=All)
 * base+11        LocalOn (bit 7)
 * base+12        PrgCh: bit1=recv, bit0=send
 * base+13        Controllers: bit1=recv, bit0=send
 * base+14        Clock: bit6=SendClock, bit5=IgnoreExternalClock (!clkre)
 * base+15        TuneCent (int8_t)
 * base+16        GlobalOctaveShiftActive (bit 7)
 * base+17        GlobalOctaveShift (int8_t)
 * base+18        TuneSemi (int8_t)
 * base+19        0x00
 * base+20        PedalPolarity (bit 7) | 0x40
 * base+21        ControlPedalGain (0-32)
 * base+22..37    0x00 x 16
 */
int g2_build_synth_set_msg(cJSON *params, uint8_t *out, size_t *out_len) {
    cJSON *jName       = cJSON_GetObjectItem(params, "synthName");
    cJSON *jMidi       = cJSON_GetObjectItem(params, "midi");
    cJSON *jTuning     = cJSON_GetObjectItem(params, "tuning");
    cJSON *jPedal      = cJSON_GetObjectItem(params, "pedal");
    if (!jName || !jMidi || !jTuning || !jPedal) return -1;

    cJSON *jSlots      = cJSON_GetObjectItem(jMidi, "slots");
    if (!jSlots) return -1;

    const char *name   = cJSON_GetStringValue(jName) ? cJSON_GetStringValue(jName) : "";
    int midiA          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jSlots, "A"));
    int midiB          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jSlots, "B"));
    int midiC          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jSlots, "C"));
    int midiD          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jSlots, "D"));
    int midiG          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jSlots, "global"));
    int sysex          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jMidi, "sysex"));
    int local          = cJSON_IsTrue(cJSON_GetObjectItem(jMidi, "local"));
    int prgch          = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jMidi, "prgch"));
    int ctrlsRecv      = cJSON_IsTrue(cJSON_GetObjectItem(jMidi, "ctrlsRecv"));
    int ctrlsSend      = cJSON_IsTrue(cJSON_GetObjectItem(jMidi, "ctrlsSend"));
    int clkse          = cJSON_IsTrue(cJSON_GetObjectItem(jMidi, "clkse"));
    int clkre          = cJSON_IsTrue(cJSON_GetObjectItem(jMidi, "clkre"));
    int tuneCent       = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jTuning, "cent"));
    int tuneSemi       = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jTuning, "semi"));
    int memProtect     = cJSON_IsTrue(cJSON_GetObjectItem(params, "memProtect"));
    int gOctActive     = cJSON_IsTrue(cJSON_GetObjectItem(params, "globalOctaveShiftActive"));
    int gOctShift      = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(params, "globalOctaveShift"));
    int pedalPol       = cJSON_IsTrue(cJSON_GetObjectItem(jPedal, "polarity"));
    int pedalGain      = (int)cJSON_GetNumberValue(cJSON_GetObjectItem(jPedal, "gain"));

    int nameLen = (int)strlen(name);
    if (nameLen > 16) nameLen = 16;
    int base = 1 + nameLen + (nameLen < 16 ? 1 : 0);   /* subcommand + name + null (omitted for 16-char names) */

    memset(out, 0, 56);
    out[0] = 0x03;
    memcpy(out + 1, name, nameLen);
    /* out[1+nameLen] = 0x00 from memset */

    out[base +  0] = 0x80;   /* required SET marker */
    /* out[base + 1] = 0x00 */
    cJSON *jPerfBank = cJSON_GetObjectItem(params, "perfBank");
    cJSON *jPerfLoc  = cJSON_GetObjectItem(params, "perfLoc");
    out[base +  2] = jPerfBank ? (uint8_t)cJSON_GetNumberValue(jPerfBank) : g2_synth_perf_bank;
    out[base +  3] = jPerfLoc  ? (uint8_t)cJSON_GetNumberValue(jPerfLoc)  : g2_synth_perf_loc;
    out[base +  4] = memProtect ? 0x80 : 0x00;
    out[base +  5] = (uint8_t)(midiA - 1);
    out[base +  6] = (uint8_t)(midiB - 1);
    out[base +  7] = (uint8_t)(midiC - 1);
    out[base +  8] = (uint8_t)(midiD - 1);
    out[base +  9] = (uint8_t)(midiG - 1);
    out[base + 10] = (uint8_t)(sysex - 1);
    out[base + 11] = local ? 0x80 : 0x00;
    out[base + 12] = (uint8_t)(prgch & 0x03);
    out[base + 13] = (uint8_t)(((ctrlsRecv & 1) << 1) | (ctrlsSend & 1));
    out[base + 14] = (uint8_t)((clkse ? (1 << 6) : 0) | (!clkre ? (1 << 5) : 0));
    out[base + 15] = (uint8_t)(int8_t)tuneCent;
    out[base + 16] = gOctActive ? 0x80 : 0x00;
    out[base + 17] = (uint8_t)(int8_t)gOctShift;
    out[base + 18] = (uint8_t)(int8_t)tuneSemi;
    /* out[base + 19] = 0x00 */
    out[base + 20] = (uint8_t)((pedalPol ? 0x80 : 0x00) | 0x40);
    out[base + 21] = (uint8_t)pedalGain;
    /* out[base + 22..37] = 0x00 */

    *out_len = (size_t)(base + 38);   /* subcmd + name + optional null + 22 fields + 16 trailing zeros */
    return 0;
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
    int focusSlot = 0, rangeEnable = 0, bpm = 0, clockRun = 0;
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
    cJSON_AddStringToObject(perf, "focus", (char*[]){ "A", "B", "C", "D" }[focusSlot]);
    cJSON_AddBoolToObject(perf, "rangeEnable", rangeEnable);
    cJSON_AddNumberToObject(perf, "bpm", bpm);
    cJSON_AddBoolToObject(perf, "clockRunning", clockRun);
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
