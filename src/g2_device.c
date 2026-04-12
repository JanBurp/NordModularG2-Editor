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
#include "bitstream.h"

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

static char *parse_name(const uint8_t *data, char *buf, size_t bufsize) {
    size_t i;
    for (i = 0; i < 16 && i < bufsize - 1; i++) {
        if (data[i] >= 0x20 && data[i] <= 0x7f) {
            buf[i] = data[i];
        } else {
            break;
        }
    }
    buf[i] = '\0';
    return buf;
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
    int transferred;
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

    /* Direct byte access based on raw data analysis:
     * Bulk data at bytes (after 4-byte header):
     *   13: perfMode
     *   14: perfBank
     *   15: perfLocation
     *   16: memProtect+padd
     *   17: (unknown/padding)
     *   18: midi slot A
     *   19: midi slot B
     *   20: midi slot C
     *   21: midi slot D
     *   22: midi global
     *   23: sysex
     *   24: local+prgch (local=bit0, prgch=bits 2-3)
     */
    midiChannels[0] = bulkData[18];
    midiChannels[1] = bulkData[19];
    midiChannels[2] = bulkData[20];
    midiChannels[3] = bulkData[21];
    midiChannels[4] = bulkData[22];
    sysexId = bulkData[23];
    localOn = bulkData[24] & 1;
    prgch = (bulkData[24] >> 2) & 3;
    mode = bulkData[13] & 1;  /* Mode is bit 0 of perfMode */
    pedalPolarity = bulkData[25] & 1;
    pedalGain = bulkData[26];

    free(bulkData);
    bulkData = NULL;

    /* Step 2: Send GET_SELECTED_PARAMETER (0x35, 0x04) */
    if (send_command(0x35, 0x04) < 0) {
        /* Non-fatal, continue */
    }

    usleep(50000);
    recv_interrupt(response, 16, USB_TIMEOUT_LONG);

    /* Note: In Patch mode, there's no performance data - each slot is independent.
     * For full performance data, the G2 needs to be in Performance mode.
     * The slot names and patch info require additional commands to retrieve.
     */

    (void)perfName;
    (void)slotNames;
    (void)slotBanks;
    (void)slotPatches;
    (void)slotActive;
    (void)focusSlot;
    (void)rangeEnable;
    (void)bpm;
    (void)clockRun;
    (void)split;

    /* Output JSON */
    const char *modeStr = mode ? "Performance" : "Patch";
    const char *slotLetters = "ABCD";
    const char *localStr = localOn ? "on" : "off";
    const char *prgchStr;
    switch (prgch) {
        case 1: prgchStr = "send"; break;
        case 2: prgchStr = "recv"; break;
        case 3: prgchStr = "send/recv"; break;
        default: prgchStr = "off";
    }

    printf("{\n");
    printf("  \"status\": \"ok\",\n");
    printf("  \"synthName\": \"%s\",\n", synthName);
    printf("  \"mode\": \"%s\",\n", modeStr);
    printf("  \"midi\": {\n");
    /* G2 MIDI channels are stored 0-15 representing 1-16, 16=off for slots, 128=off for global */
    if (midiChannels[0] == 16) printf("    \"slotA\": \"off\",\n"); else printf("    \"slotA\": %d,\n", midiChannels[0]);
    if (midiChannels[1] == 16) printf("    \"slotB\": \"off\",\n"); else printf("    \"slotB\": %d,\n", midiChannels[1]);
    if (midiChannels[2] == 16) printf("    \"slotC\": \"off\",\n"); else printf("    \"slotC\": %d,\n", midiChannels[2]);
    if (midiChannels[3] == 16) printf("    \"slotD\": \"off\",\n"); else printf("    \"slotD\": %d,\n", midiChannels[3]);
    if (midiChannels[4] == 128) printf("    \"global\": \"off\"\n"); else printf("    \"global\": %d\n", midiChannels[4]);
    printf("  },\n");
    printf("  \"sysex\": %d,\n", sysexId + 1);
    printf("  \"local\": %s,\n", localOn ? "true" : "false");
    printf("  \"prgch\": \"%s\",\n", prgchStr);
    printf("  \"tuning\": {\n");
    printf("    \"semi\": %d,\n", (int8_t)tuneSemi);
    printf("    \"cent\": %d\n", (int8_t)tuneCent);
    printf("  },\n");
    printf("  \"pedal\": {\n");
    printf("    \"polarity\": \"%s\",\n", pedalPolarity ? "closed" : "open");
    printf("    \"gain\": %.2f\n", 1.0 + 0.5 * pedalGain / 32.0);
    printf("  }\n");
    printf("}\n");

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
