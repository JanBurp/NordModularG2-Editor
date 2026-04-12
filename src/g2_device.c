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
    
    printf("G2 found, connecting...\n");
    
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
    printf("Connected to G2\n");
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
    printf("Disconnected\n");
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

static int recv_interrupt(uint8_t *response, int size, int timeout_ms) {
    int transferred = 0;
    int ret;
    ret = libusb_interrupt_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, response, size, &transferred, timeout_ms);
    if (ret != 0 || transferred == 0) {
        return -1;
    }
    return transferred;
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

int g2_status(output_format_t format) {
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
    int midiChannels[5] = {0};
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
    int status = 0;

    (void)format;

    if (!g2_is_connected()) {
        if (g2_connect() < 0) {
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
    mode = bulkData[14] & 1;  /* mode (bit 0) */
    midiChannels[0] = bulkData[18];  /* MIDI A */
    midiChannels[1] = bulkData[19];  /* MIDI B */
    midiChannels[2] = bulkData[20];  /* MIDI C */
    midiChannels[3] = bulkData[21];  /* MIDI D */
    midiChannels[4] = bulkData[22];  /* MIDI global */
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

    /* Performance data starts at byte 21 (after 4-byte header + 16-byte name + null) */
    focusSlot = (perfData[21] >> 2) & 0x03;  /* bits 2-3 of byte 21 */
    rangeEnable = (perfData[22] >> 0) & 0x01;  /* bit 0 of byte 22 */
    bpm = perfData[26];  /* byte 26 */
    split = (perfData[26] >> 1) & 0x01;  /* bit 1 of byte 26 */
    clockRun = (perfData[28] >> 0) & 0x01;  /* bit 0 of byte 28 */

    /* Based on g2ctl:
     * data = data[4:] (skip 4-byte header)
     * parse_name gets perf name, data now points after perf name
     * data = data[11:] (skip 7 bytes perf settings + 4 padding)
     * Then for each slot: parse_name(data) gets name, data[:7] gets slot data, data = data[10:]
     */
    
    /* Start after header (4 bytes) */
    uint8_t *slotPtr = perfData + 4;
    
    /* Skip perf name using parse_name to get remaining data */
    char tmpName[32];
    int nameLen = parse_name(slotPtr, tmpName, sizeof(tmpName));
    slotPtr += nameLen;  /* Advance past the name */
    
    /* Skip 11 bytes (7 perf settings + 4 padding) to get to slot data */
    slotPtr += 11;
    
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

    /* Output JSON */
    const char *modeStr = mode ? "Performance" : "Patch";
    const char *prgchStr;
    switch (prgch) {
        case 1: prgchStr = "send"; break;
        case 2: prgchStr = "recv"; break;
        case 3: prgchStr = "send/recv"; break;
        default: prgchStr = "off";
    }

    printf("{\n");
    printf("  \"name\": \"%s\",\n", synthName);
    printf("  \"mode\": \"%s\",\n", modeStr);
    printf("  \"midi\": {\n");
    printf("    \"slots\": {\n");
    printf("      \"a\": %d,\n", midiChannels[0]);
    printf("      \"b\": %d,\n", midiChannels[1]);
    printf("      \"c\": %d,\n", midiChannels[2]);
    printf("      \"d\": %d,\n", midiChannels[3]);
    printf("      \"global\": %d\n", midiChannels[4]);
    printf("    },\n");
    printf("    \"sysex\": %d,\n", sysexId + 1);
    printf("    \"local\": %s,\n", localOn ? "true" : "false");
    printf("    \"prgch\": \"%s\",\n", prgchStr);
    printf("    \"clkse\": %s,\n", clkSend ? "false" : "true");
    printf("    \"clkre\": %s\n", clkRecv ? "false" : "true");
    printf("  },\n");
    printf("  \"tuning\": {\n");
    printf("    \"semi\": %d,\n", (int8_t)tuneSemi);
    printf("    \"cent\": %d\n", (int8_t)tuneCent);
    printf("  },\n");
    printf("  \"pedal\": {\n");
    printf("    \"polarity\": %s,\n", pedalPolarity ? "true" : "false");
    printf("    \"gain\": %.1f\n", 1.0 + 0.5 * pedalGain / 32.0);
    printf("  },\n");
    printf("  \"performance\": {\n");
    printf("    \"name\": \"%s\",\n", perfName);
    printf("    \"focus\": \"%c\",\n", "abcd"[focusSlot]);
    printf("    \"rangeEnable\": %s,\n", rangeEnable ? "true" : "false");
    printf("    \"bpm\": %d,\n", bpm);
    printf("    \"clockRunning\": %s,\n", clockRun ? "true" : "false");
    printf("    \"kbSplit\": %s\n", split ? "true" : "false");
    printf("  },\n");
    printf("  \"slots\": [\n");
    for (int i = 0; i < 4; i++) {
        printf("    {\n");
        printf("      \"slot\": \"%c\",\n", 'a' + i);
        printf("      \"patch\": \"%d:%d\",\n", slotBanks[i] + 1, slotPatches[i] + 1);
        printf("      \"name\": \"%s\",\n", slotNames[i]);
        printf("      \"active\": %s,\n", slotActive[i] ? "true" : "false");
        printf("      \"key\": %s,\n", slotKey[i] ? "true" : "false");
        printf("      \"hold\": %s,\n", slotHold[i] ? "true" : "false");
        printf("      \"range\": {\"lower\": %d, \"upper\": %d}\n", slotLow[i], slotHigh[i]);
        printf("    }");
        if (i < 3) printf(",");
        printf("\n");
    }
    printf("  ]\n");
    printf("}\n");

    (void)slotNames;
    (void)slotBanks;
    (void)slotPatches;
    (void)slotActive;

    return status;
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
    (void)slot_str;
    fprintf(stderr, "Select slot command not yet implemented\n");
    return -1;
}

int g2_select_variation(int variation) {
    (void)variation;
    fprintf(stderr, "Select variation command not yet implemented\n");
    return -1;
}
