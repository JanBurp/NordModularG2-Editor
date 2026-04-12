/*
 * G2 CLI - Device implementation
 * Based on usbComms.c from G2-Edit
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <libusb.h>
#include "defs.h"
#include "g2_device.h"
#include "output.h"
#include "cJSON.h"

/* Global device state */
static g2_device_t g2 = {
    .ctx = NULL,
    .handle = NULL,
    .interface_claimed = 0
};

/* Timeout values (in ms) */
#define USB_TIMEOUT_STANDARD 100
#define USB_TIMEOUT_LONG    2000

/* Command message building */
#define COMMAND_OFFSET 2

/* CRC calculation (from G2-Edit utils.c) */
static uint16_t crc_iterator(int32_t seed, int32_t val) {
    int32_t k = (((seed >> 8) ^ val) & 255) << 8;
    int32_t crc = 0;
    for (int i = 0; i < 8; i++) {
        if ((crc ^ k) & 0x8000) {
            crc = (crc << 1) ^ 0x1021;
        } else {
            crc = crc << 1;
        }
        k = k << 1;
    }
    return (uint16_t)((seed << 8) ^ crc) & 0xFFFF;
}

static uint16_t calc_crc16(uint8_t *buff, int length) {
    uint16_t crc = 0;
    for (int i = 0; i < length; i++) {
        crc = crc_iterator(crc, buff[i]);
    }
    return crc;
}

int g2_init(void) {
    int ret = libusb_init(&g2.ctx);
    if (ret < 0) {
        fprintf(stderr, "Failed to initialize libusb: %s\n", libusb_error_name(ret));
        return -1;
    }
    return 0;
}

void g2_exit(void) {
    if (g2.handle) {
        g2_disconnect();
    }
    if (g2.ctx) {
        libusb_exit(g2.ctx);
        g2.ctx = NULL;
    }
}

int g2_list_devices(void) {
    libusb_device **devices;
    ssize_t count = libusb_get_device_list(g2.ctx, &devices);
    
    if (count < 0) {
        fprintf(stderr, "Failed to get device list\n");
        return -1;
    }
    
    printf("USB Devices:\n");
    for (ssize_t i = 0; i < count; i++) {
        libusb_device *dev = devices[i];
        struct libusb_device_descriptor desc;
        
        int ret = libusb_get_device_descriptor(dev, &desc);
        if (ret == 0) {
            const char *g2_label = (desc.idVendor == VENDOR_ID && desc.idProduct == PRODUCT_ID) ? " ← Nord G2" : "";
            printf("  %04x:%04x (bus %d, device %d)%s\n",
                   desc.idVendor, desc.idProduct,
                   libusb_get_bus_number(dev),
                   libusb_get_device_address(dev),
                   g2_label);
        }
    }
    
    libusb_free_device_list(devices, 1);
    return 0;
}

int g2_connect(void) {
    int ret;
    
    /* Find G2 device */
    g2.handle = libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    if (!g2.handle) {
        fprintf(stderr, "G2 not found (VID=%04x, PID=%04x)\n", VENDOR_ID, PRODUCT_ID);
        return -1;
    }
    
    fprintf(stderr, "G2 found, connecting...\n");
    
    /* Reset device (like G2-Edit does) */
    ret = libusb_reset_device(g2.handle);
    if (ret < 0) {
        fprintf(stderr, "Warning: device reset failed: %s\n", libusb_error_name(ret));
    }
    
    /* Claim interface 0 */
    ret = libusb_claim_interface(g2.handle, 0);
    if (ret < 0) {
        fprintf(stderr, "Failed to claim interface: %s\n", libusb_error_name(ret));
        libusb_close(g2.handle);
        g2.handle = NULL;
        return -1;
    }
    
    g2.interface_claimed = 1;
    fprintf(stderr, "Connected to G2\n");
    return 0;
}

int g2_connect_silent(void) {
    int ret;
    
    /* Find G2 device */
    g2.handle = libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    if (!g2.handle) {
        return -1;
    }
    
    /* Reset device (like G2-Edit does) */
    ret = libusb_reset_device(g2.handle);
    if (ret < 0) {
        /* silently ignore reset failure */
    }
    
    /* Claim interface 0 */
    ret = libusb_claim_interface(g2.handle, 0);
    if (ret < 0) {
        libusb_close(g2.handle);
        g2.handle = NULL;
        return -1;
    }
    
    g2.interface_claimed = 1;
    return 0;
}

int g2_disconnect(void) {
    if (g2.interface_claimed && g2.handle) {
        libusb_release_interface(g2.handle, 0);
        g2.interface_claimed = 0;
    }
    if (g2.handle) {
        libusb_close(g2.handle);
        g2.handle = NULL;
    }
    fprintf(stderr, "Disconnected\n");
    return 0;
}

int g2_is_connected(void) {
    return g2.handle != NULL && g2.interface_claimed;
}

int g2_send_command(uint8_t *data, int length) {
    int transferred = 0;
    int ret;
    
    if (!g2.handle) {
        fprintf(stderr, "Not connected\n");
        return -1;
    }
    
    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        fprintf(stderr, "Write failed: %s\n", libusb_error_name(ret));
        return -1;
    }
    
    return transferred;
}

int g2_recv_response(uint8_t *buffer, int size, int timeout_ms) {
    int transferred = 0;
    int ret;
    
    if (!g2.handle) {
        fprintf(stderr, "Not connected\n");
        return -1;
    }
    
    /* G2-Edit uses bulk_transfer on endpoint 0x81 (interrupt endpoint) */
    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, buffer, size, &transferred, timeout_ms);
    if (ret < 0) {
        if (ret == LIBUSB_ERROR_TIMEOUT) {
            return 0;  /* Timeout - no data */
        }
        fprintf(stderr, "Read failed: %s\n", libusb_error_name(ret));
        return -1;
    }
    
    return transferred;
}

slot_t parse_slot(const char *slot_str) {
    if (slot_str == NULL) {
        return SLOT_CURRENT;
    }
    if (strcmp(slot_str, "A") == 0 || strcmp(slot_str, "a") == 0) return SLOT_A;
    if (strcmp(slot_str, "B") == 0 || strcmp(slot_str, "b") == 0) return SLOT_B;
    if (strcmp(slot_str, "C") == 0 || strcmp(slot_str, "c") == 0) return SLOT_C;
    if (strcmp(slot_str, "D") == 0 || strcmp(slot_str, "d") == 0) return SLOT_D;
    return SLOT_CURRENT;
}

static int send_command(uint8_t cmd, uint8_t subcmd) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;
    int msgLength;
    uint16_t crc;
    int transferred;
    int ret;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;
    buff[pos++] = cmd;
    buff[pos++] = subcmd;

    msgLength = pos - COMMAND_OFFSET;
    crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        return -1;
    }
    return 0;
}

static int send_command_with_data(uint8_t cmd, uint8_t *data, int dataLen) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;
    int msgLength;
    uint16_t crc;
    int transferred;
    int ret;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;
    buff[pos++] = cmd;
    for (int i = 0; i < dataLen; i++) {
        buff[pos++] = data[i];
    }

    msgLength = pos - COMMAND_OFFSET;
    crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        return -1;
    }
    return 0;
}

static int send_slot_command(uint8_t slot, uint8_t version, uint8_t subcmd) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;
    int msgLength;
    uint16_t crc;
    int transferred;
    int ret;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | slot;
    buff[pos++] = version;
    buff[pos++] = subcmd;

    msgLength = pos - COMMAND_OFFSET;
    crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        return -1;
    }
    return 0;
}

static int send_slot_command_with_data(uint8_t slot, uint8_t version, uint8_t subcmd, uint8_t *extraData, int extraLen) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;
    int msgLength;
    uint16_t crc;
    int transferred;
    int ret;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | slot;
    buff[pos++] = version;
    buff[pos++] = subcmd;
    for (int i = 0; i < extraLen; i++) {
        buff[pos++] = extraData[i];
    }

    msgLength = pos - COMMAND_OFFSET;
    crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    fprintf(stderr, "DEBUG: send_slot_command_with_data: slot=%d, version=0x%02x, subcmd=0x%02x\n", 
            slot, version, subcmd);
    fprintf(stderr, "DEBUG: sending %d bytes: ", msgLength);
    for (int i = 0; i < msgLength; i++) fprintf(stderr, "%02x ", buff[i]);
    fprintf(stderr, "\n");

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        return -1;
    }
    return 0;
}

static int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries) {
    int transferred = 0;
    int ret;
    for (int i = 0; i < retries; i++) {
        ret = libusb_interrupt_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, response, size, &transferred, timeout_ms);
        if (ret == 0 && transferred > 0) {
            return transferred;
        }
        usleep(10000);  // Small delay between retries
    }
    return -1;
}

static int recv_interrupt(uint8_t *response, int size, int timeout_ms) {
    return recv_interrupt_with_retry(response, size, timeout_ms, 1);
}

static int recv_bulk(uint8_t *data, uint16_t size) {
    int transferred;
    int ret;
    int retries = 5;
    int received = 0;
    while (retries > 0 && received < size) {
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN, data + received, size - received, &transferred, USB_TIMEOUT_LONG);
        if (ret == 0 && transferred > 0) {
            received += transferred;
        } else {
            retries--;
        }
    }
    return received;
}

static int parse_name(const uint8_t *data, char *buf, size_t bufsize) {
    size_t i;
    for (i = 0; i < 16 && i < bufsize - 1; i++) {
        if (data[i] >= 0x20 && data[i] <= 0x7f) {
            buf[i] = data[i];
        } else {
            break;
        }
    }
    buf[i] = '\0';
    /* Include null terminator in count if present */
    if (i < 16 && data[i] == 0) {
        return (int)(i + 1);
    }
    return (int)i;
}

int g2_settings(output_format_t format) {
    uint8_t response[8192] = {0};
    uint8_t *bulkData = NULL;
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
    int ret;
    uint8_t msgType;
    uint16_t size;

    if (!g2_is_connected()) {
        int connect_ret;
        /* Use silent connect for JSON output mode to avoid polluting stdout */
        if (format == OUTPUT_JSON) {
            connect_ret = g2_connect_silent();
        } else {
            connect_ret = g2_connect();
        }
        if (connect_ret < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return -1;
        }
    }

    /* Step 1: Send GET_SYNTH_SETTINGS (0x02) */
    if (send_command(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        fprintf(stderr, "Failed to send synth settings command\n");
        return -1;
    }

    usleep(100000);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_LONG);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2\n");
        return -1;
    }

    msgType = response[0] & 0x0f;
    if (msgType != RESPONSE_TYPE_EXTENDED) {
        fprintf(stderr, "Unexpected response type %d\n", msgType);
        return -1;
    }

    size = (response[1] << 8) | response[2];
    bulkData = malloc(size);
    if (!bulkData) {
        fprintf(stderr, "Memory allocation failed\n");
        return -1;
    }

    if (recv_bulk(bulkData, size) <= 0) {
        fprintf(stderr, "Failed to read bulk data\n");
        free(bulkData);
        return -1;
    }

    /* Parse synth name (up to 16 bytes at offset 4) */
    parse_name(bulkData + 4, synthName, sizeof(synthName));

    /* Direct byte access based on g2ctl.py bitstream analysis:
      * Name is 10 bytes (9 chars + null), so bitstream starts at byte 14
      * g2ctl: bitstream.seek_bit(8*5) = bit 40, then reads 5 x 8 bits for MIDI
      * At bit 40: byte 5 of data starting at byte 14 = bulkData[19]
      * But g2ctl shows MIDI A = 10, and bulkData[19] = 0x0a = 10
      * 
      * After name (10 bytes at offset 4):
      * Offset 14: Perf Mode
      * Offset 15: Perf Bank
      * Offset 16: Perf Location
      * Offset 17: Memory Protect + padding
      * Offset 18: MIDI Slot A = 0x0a = 10 ✓
      * Offset 19: MIDI Slot B = 0x0b = 11 ✓
      * Offset 20: MIDI Slot C = 0x0c = 12 ✓
      * Offset 21: MIDI Slot D = 0x0d = 13 ✓
      * Offset 22: Global chan = 0x0f = 15 ✓
      * Offset 23: Sysex ID = 0x10 = 16, g2ctl shows 17 (adds 1)
      * Offset 24: Local on (bit 7)
      * Offset 25: Prog Change Rcv (bit 0), Snd (bit 1)
      * Offset 26: Controllers
      * Offset 27: Send Clock (bit 1), Receive Clock (bit 0)
      * Offset 28: Tune cent
      * Offset 30: Tune semi
      * Offset 32: Pedal Polarity (bit 0)
      * Offset 34: Control Pedal Gain (NOT 33!)
      */
    /* Mode is bit 7 of byte after null terminator (bulkData[13]) */
    mode = (bulkData[13] >> 7) & 1;  /* mode (bit 7) */
    midiCh[0] = bulkData[18];  /* MIDI A */
    midiCh[1] = bulkData[19];  /* MIDI B */
    midiCh[2] = bulkData[20];  /* MIDI C */
    midiCh[3] = bulkData[21];  /* MIDI D */
    midiCh[4] = bulkData[22];  /* MIDI global */
    sysexId = bulkData[23];  /* sysex */
    localOn = (bulkData[24] >> 7) & 1;  /* local (bit 7) */
    prgch = ((bulkData[25] >> 0) & 1) | ((bulkData[25] >> 1) & 1) << 1;  /* Rcv at bit 0, Snd at bit 1 */
    clkSend = (bulkData[27] >> 1) & 1;  /* clkse (bit 1 of byte 27) - lookup ['on', 'off'] 0=on */
    clkRecv = bulkData[27] & 1;  /* clkre (bit 0 of byte 27) */
    tuneCent = bulkData[28];  /* tune cent */
    tuneSemi = bulkData[30];  /* tune semi */
    pedalPolarity = bulkData[32] & 1;  /* pedal polarity (bit 0) */
    pedalGain = bulkData[34];  /* pedal gain (byte 34, not 33) */

    free(bulkData);
    bulkData = NULL;

    /* Step 2: Get performance data with 0x81 and 0x10 commands */
    uint8_t selsData[1024] = {0};
    uint8_t selsInterrupt[16] = {0};
    
    if (send_command(0x41, 0x81) == 0) {
        usleep(100000);
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_LONG);
        
        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    uint8_t perfData[1024] = {0};
    uint8_t perfInterrupt[16] = {0};
    if (send_command(selsData[2], 0x10) == 0) {
        usleep(100000);
        ret = recv_interrupt(perfInterrupt, 16, USB_TIMEOUT_LONG);
        
        if (ret > 0 && (perfInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (perfInterrupt[1] << 8) | perfInterrupt[2];
            recv_bulk(perfData, size);
        }
    }

    if (perfData[0] != 0) {
        parse_name(perfData + 4, perfName, sizeof(perfName));
    }
    
    /* Performance data parsing - matching g2ctl's BitStream implementation:
     * data = perfData[4:] (skip 4-byte header)
     * parse_name(data) returns (name, remaining starting at byte after name)
     * g2ctl: BitStream(data, 8*4) positions at bit 32
     * Focus is bits 4-5 of byte 4 of remaining
     */
    uint8_t *remaining = perfData + 4;
    
    char tmpName[32];
    int nameLen = parse_name(remaining, tmpName, sizeof(tmpName));
    
    remaining += nameLen;  /* Skip past name */
    
    /* g2ctl's BitStream(data, 8*4) reads at bit position 32
     * Focus is 2 bits at bit 36 (after 4 bits skip + 2 bits focus)
     * Extract using proper bitstream formula: word bits 30-31
     */
    uint8_t *perfSettings = remaining + 4;  /* Byte 4 of remaining = bit 32 position */
    
    /* Pack 4 bytes for bitstream reading */
    uint32_t word = (perfSettings[0] << 24) | (perfSettings[1] << 16) | (perfSettings[2] << 8) | perfSettings[3];
    
    /* Extract focus from bits 36-37: (word >> 26) & 3 */
    focusSlot = (word >> (32 - 4 - 2)) & 0x3;
    
    /* g2ctl reads 8-bit values for range_enable, bpm, split, clock at bit 38+ */
    rangeEnable = remaining[5];
    bpm = remaining[6];
    split = remaining[7] & 1;
    clockRun = remaining[8] & 1;
    
    /* g2ctl: data = data[11:] to skip to slot data */
    uint8_t *slotPtr = remaining + 11;
    
    /* Now parse each slot */
    for (int i = 0; i < 4; i++) {
        /* Parse slot name */
        nameLen = parse_name(slotPtr, slotNames[i], 17);
        slotPtr += nameLen;
        
        /* Read 7 bytes: active, key, hold, bank, patch, low, high */
        slotActive[i] = slotPtr[0] & 1;
        slotKey[i] = slotPtr[1] & 1;
        slotHold[i] = slotPtr[2] & 1;
        slotBanks[i] = slotPtr[3];
        slotPatches[i] = slotPtr[4];
        slotLow[i] = slotPtr[5];
        slotHigh[i] = slotPtr[6];
        
        /* Skip 10 bytes (7 slot data + 3 padding) */
        slotPtr += 10;
    }

    /* Build JSON output using cJSON */
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "synthName", synthName);
    cJSON_AddStringToObject(root, "mode", mode ? "Performance" : "Patch");
    
    /* midi object */
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
    
    /* tuning object */
    cJSON *tuning = cJSON_CreateObject();
    cJSON_AddNumberToObject(tuning, "semi", tuneSemi);
    cJSON_AddNumberToObject(tuning, "cent", tuneCent);
    cJSON_AddItemToObject(root, "tuning", tuning);
    
    /* pedal object - gain is 1.0 + 0.5 * val / 32 */
    cJSON *pedal = cJSON_CreateObject();
    cJSON_AddBoolToObject(pedal, "polarity", pedalPolarity);
    cJSON_AddNumberToObject(pedal, "gain", 1.0 + 0.5 * pedalGain / 32.0);
    cJSON_AddItemToObject(root, "pedal", pedal);
    
    /* performance or patches object - depends on mode */
    cJSON *perf = cJSON_CreateObject();
    const char *perfNameToUse = mode ? perfName : slotNames[focusSlot];
    cJSON_AddStringToObject(perf, "name", perfNameToUse);
    cJSON_AddStringToObject(perf, "focus", (char*[]){ "a", "b", "c", "d" }[focusSlot]);
    cJSON_AddBoolToObject(perf, "rangeEnable", rangeEnable);
    cJSON_AddNumberToObject(perf, "bpm", bpm);
    cJSON_AddBoolToObject(perf, "clockRunning", clockRun);
    cJSON_AddBoolToObject(perf, "kbSplit", split);
    cJSON_AddItemToObject(root, mode ? "performance" : "patches", perf);
    
    /* slots array */
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
    
    output_json(root, format);
    cJSON_Delete(root);
    return 0;
}

int g2_get_patch(const char *slot_str, output_format_t format) {
    (void)slot_str;
    (void)format;
    fprintf(stderr, "Get patch command not yet implemented\n");
    return -1;
}

int g2_get_patch_name(const char *slot_str, output_format_t format) {
    (void)slot_str;
    (void)format;
    fprintf(stderr, "Get patch name command not yet implemented\n");
    return -1;
}

int g2_select_slot(const char *slot_str) {
    int slot;
    uint8_t response[16] = {0};
    uint8_t version;
    int ret;
    uint8_t mask;
    uint8_t data[8] = {0};

    if (!g2_is_connected()) {
        ret = g2_connect();
        if (ret < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return -1;
        }
    }

    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        fprintf(stderr, "Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        return -1;
    }

    /* Step 1: Send 0x41, 0x7d, 0x00 to get version */
    data[0] = 0x7d;
    data[1] = 0x00;
    if (send_command_with_data(0x41, data, 2) < 0) {
        fprintf(stderr, "Failed to send slot command 1\n");
        return -1;
    }
    usleep(100000);
    
    ret = recv_interrupt(response, 16, USB_TIMEOUT_LONG);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2 for slot command 1\n");
        return -1;
    }
    version = response[3];

    /* Step 2: Send [version, 0x07, mask, 0x0f, mask] */
    mask = 0x08 >> slot;
    data[0] = 0x07;
    data[1] = mask;
    data[2] = 0x0f;
    data[3] = mask;
    if (send_command_with_data(version, data, 4) < 0) {
        fprintf(stderr, "Failed to send slot command 2\n");
        return -1;
    }
    usleep(100000);
    recv_interrupt(response, 16, USB_TIMEOUT_LONG);

    /* Step 3: Send [version, 0x09, slot] */
    data[0] = 0x09;
    data[1] = slot;
    if (send_command_with_data(version, data, 2) < 0) {
        fprintf(stderr, "Failed to send slot command 3\n");
        return -1;
    }
    usleep(100000);
    recv_interrupt(response, 16, USB_TIMEOUT_LONG);

    /* Step 4: Send [CMD_SLOT+slot, 0x0a, 0x70] */
    data[0] = 0x0a;
    data[1] = 0x70;
    if (send_slot_command(slot, 0x0a, 0x70) < 0) {
        fprintf(stderr, "Failed to send slot command 4\n");
        return -1;
    }
    usleep(100000);
    recv_interrupt(response, 16, USB_TIMEOUT_LONG);

    return 0;
}

int g2_select_variation(int variation) {
    uint8_t response[16] = {0};
    uint8_t slota[16] = {0};
    uint8_t slotIndex;
    int ret;
    uint8_t extraData[1] = {0};

    if (variation < 1 || variation > 8) {
        fprintf(stderr, "Invalid variation: %d (must be 1-8)\n", variation);
        return -1;
    }

    if (!g2_is_connected()) {
        ret = g2_connect();
        if (ret < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return -1;
        }
    }

    /* Step 1: Send [CMD_SYS, 0x41, 0x35, 0x00] to get current slot info */
    uint8_t cmdData[4] = {0x35, 0x00};
    fprintf(stderr, "DEBUG: Sending variation cmd1: [0x41, 0x35, 0x00]\n");
    if (send_command_with_data(0x41, cmdData, 2) < 0) {
        fprintf(stderr, "Failed to send variation command 1\n");
        return -1;
    }
    usleep(100000);
    
    ret = recv_interrupt(slota, 16, USB_TIMEOUT_LONG);
    fprintf(stderr, "DEBUG: variation cmd1 response (%d bytes): ", ret);
    for (int i = 0; i < ret && i < 16; i++) fprintf(stderr, "%02x ", slota[i]);
    fprintf(stderr, "\n");
    if (ret <= 0) {
        fprintf(stderr, "No response from G2 for variation command 1\n");
        return -1;
    }
    slotIndex = slota[5];
    fprintf(stderr, "DEBUG: slotIndex = %d (0x%02x)\n", slotIndex, slotIndex);

    /* Step 2: Send [CMD_A, slota[5], 0x6a, variation - 1]
     * Python uses CMD_A (0x08) as base, not CMD_A + slot
     * Use slot=0 (slot A), version=slota[5] from first response
     * Try version 0x0a (common version used in other commands) */
    extraData[0] = variation - 1;
    fprintf(stderr, "DEBUG: Sending variation cmd2: slot=0, version=0x%02x, subcmd=0x6a, extra=%d\n", 
            0x0a, extraData[0]);
    if (send_slot_command_with_data(0, 0x0a, 0x6a, extraData, 1) < 0) {
        fprintf(stderr, "Failed to send variation command 2\n");
        return -1;
    }
    usleep(100000);
    ret = recv_interrupt_with_retry(response, 16, USB_TIMEOUT_LONG, 5);
    fprintf(stderr, "DEBUG: variation cmd2 response (%d bytes): ", ret);
    for (int i = 0; i < ret && i < 16; i++) fprintf(stderr, "%02x ", response[i]);
    fprintf(stderr, "\n");

    return 0;
}
