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
#include "utils.h"
#include "cJSON.h"

/* Global device state */
static g2_device_t g2 = {
    .ctx = NULL,
    .handle = NULL,
    .interface_claimed = 0
};
typedef struct {
    uint8_t slot;
    uint8_t version;
    int valid;
} g2_version_cache_t;

static g2_version_cache_t version_cache = { .valid = 0 };

/* Timeout values (in ms) */
#define USB_TIMEOUT_STANDARD 100
#define USB_TIMEOUT_LONG    2000

/* Delay after USB send (in us) */
#define USB_SEND_DELAY_US    10000

/* Command message building */
#define COMMAND_OFFSET 2

static void invalidate_version_cache(void);
static int recv_interrupt(uint8_t *response, int size, int timeout_ms);
static int recv_bulk(uint8_t *data, uint16_t size);
static int send_system(uint8_t cmd, uint8_t subcmd);
static int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen);
static int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
                     const uint8_t *extra, size_t extraLen);
static int g2_drain_pending(void);

static uint8_t get_version_for_slot(uint8_t slot) {
    uint8_t response[16] = {0};
    int ret;

    if (version_cache.valid) {
        return version_cache.version;
    }

    /* Use GET_PATCH_VERSION (0x35) — does not trigger streaming, unlike START_COMM */
    uint8_t cmd[2] = {SUB_COMMAND_GET_PATCH_VERSION, slot};
    if (send_system_data(0x41, cmd, 2) < 0) {
        return 0x41;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        return 0x41;
    }

    uint8_t version = response[6];
    if (version == 0) {
        version = 0x41;
    }

    version_cache.slot = slot;
    version_cache.version = version;
    version_cache.valid = 1;

    return version_cache.version;
}

static void invalidate_version_cache(void) {
    version_cache.valid = 0;
}

static int ensure_connected(int silent) {
    if (g2_is_connected()) {
        return 0;
    }
    return silent ? g2_connect_silent() : g2_connect();
}

int g2_init(void) {
    int ret = libusb_init(&g2.ctx);
    if (ret < 0) {
        fprintf(stderr, "Failed to initialize libusb: %s\n", libusb_error_name(ret));
        return G2_ERR_NO_MEMORY;
    }
    return G2_OK;
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
        return G2_ERR;
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
        return G2_ERR_NOT_FOUND;
    }

    fprintf(stderr, "G2 found, connecting...\n");

    /* Claim interface 0 */
    ret = libusb_claim_interface(g2.handle, 0);
    if (ret < 0) {
        fprintf(stderr, "Failed to claim interface: %s\n", libusb_error_name(ret));
        libusb_close(g2.handle);
        g2.handle = NULL;
        return G2_ERR_CLAIM_INTERFACE;
    }

    g2.interface_claimed = 1;
    fprintf(stderr, "Connected to G2\n");
    return G2_OK;
}

int g2_connect_silent(void) {
    int ret;

    /* Find G2 device */
    g2.handle = libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    if (!g2.handle) {
        return G2_ERR_NOT_FOUND;
    }

    /* Claim interface 0 */
    ret = libusb_claim_interface(g2.handle, 0);
    if (ret < 0) {
        libusb_close(g2.handle);
        g2.handle = NULL;
        return G2_ERR_CLAIM_INTERFACE;
    }

    g2.interface_claimed = 1;
    return G2_OK;
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
    invalidate_version_cache();
    fprintf(stderr, "Disconnected\n");
    return 0;
}

int g2_is_connected(void) {
    return g2.handle != NULL && g2.interface_claimed;
}

/* Send CMD_INIT (0x80) — the first step of the startup sequence.
 * Resets the G2's patch version counters and returns G2 type info. */
static int send_init_msg(void) {
    uint8_t buff[8] = {0};
    buff[COMMAND_OFFSET] = 0x80;
    int msgLen = 1;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLen);
    buff[COMMAND_OFFSET + 1] = (crc >> 8) & 0xff;
    buff[COMMAND_OFFSET + 2] = crc & 0xff;
    msgLen += 4;
    buff[0] = (msgLen >> 8) & 0xff;
    buff[1] = msgLen & 0xff;
    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLen,
                                   &transferred, USB_TIMEOUT_STANDARD);
    return (ret < 0) ? -1 : 0;
}

int g2_send_init(void) {
    uint8_t response[16] = {0};

    if (ensure_connected(1) < 0) return G2_ERR_CONNECT;

    /* Drain any stale notifications before sending CMD_INIT so we don't
     * mistake a leftover notification for the init response. */
    g2_drain_pending();

    if (send_init_msg() < 0) {
        fprintf(stderr, "Failed to send init message\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    int ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No response to init message\n");
        return G2_ERR_RECV;
    }

    if ((response[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        fprintf(stderr, "Unexpected response type to init: %02x\n", response[0]);
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
            fprintf(stderr, "Unexpected init response data: %02x\n", first);
            return G2_ERR_RECV;
        }
    }

    /* Init resets the G2's version counters, so our cache is stale. */
    invalidate_version_cache();

    return G2_OK;
}

int g2_send_command(uint8_t *data, int length) {
    int transferred = 0;
    int ret;

    if (!g2.handle) {
        fprintf(stderr, "Not connected\n");
        return G2_ERR;
    }

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        fprintf(stderr, "Write failed: %s\n", libusb_error_name(ret));
        return G2_ERR_SEND;
    }

    return transferred;
}

int g2_recv_response(uint8_t *buffer, int size, int timeout_ms) {
    int transferred = 0;
    int ret;

    if (!g2.handle) {
        fprintf(stderr, "Not connected\n");
        return G2_ERR;
    }

    /* G2-Edit uses bulk_transfer on endpoint 0x81 (interrupt endpoint) */
    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, buffer, size, &transferred, timeout_ms);
    if (ret < 0) {
        if (ret == LIBUSB_ERROR_TIMEOUT) {
            return 0;  /* Timeout - no data */
        }
        fprintf(stderr, "Read failed: %s\n", libusb_error_name(ret));
        return G2_ERR_RECV;
    }

    return transferred;
}

static int send_system(uint8_t cmd, uint8_t subcmd) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;
    buff[pos++] = cmd;
    buff[pos++] = subcmd;

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    return (ret < 0) ? -1 : 0;
}

static int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;
    buff[pos++] = cmd;

    for (size_t i = 0; i < extraLen; i++) {
        buff[pos++] = extra[i];
    }

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    return (ret < 0) ? -1 : 0;
}

static int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
                     const uint8_t *extra, size_t extraLen) {
    uint8_t buff[256] = {0};
    int pos = COMMAND_OFFSET;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | slot;
    buff[pos++] = version;
    buff[pos++] = subcmd;

    for (size_t i = 0; i < extraLen; i++) {
        buff[pos++] = extra[i];
    }

    int msgLength = pos - COMMAND_OFFSET;
    uint16_t crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    int transferred;
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    return (ret < 0) ? -1 : 0;
}

static int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries) {
    int transferred = 0;
    int ret;
    for (int i = 0; i < retries; i++) {
        /* Use bulk_transfer even on the interrupt endpoint: g2_recv_response does
         * the same and libusb_interrupt_transfer on macOS can ignore timeouts
         * after many rapid transfers, causing the watch loop to hang. */
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, response, size, &transferred, timeout_ms);
        if (ret == 0 && transferred > 0) {
            return transferred;
        }
        usleep(USB_SEND_DELAY_US);
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
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN, data + received, size - received, &transferred, USB_TIMEOUT_STANDARD);
        if (ret == 0 && transferred > 0) {
            received += transferred;
        } else {
            retries--;
        }
    }
    return received;
}

cJSON* g2_parse_settings(const uint8_t *bulkData, size_t bulkSize,
                         const uint8_t *perfData, size_t perfSize) {
    (void)bulkSize;  /* Currently using fixed offsets, size not needed */
    (void)perfSize;  /* Currently using fixed offsets, size not needed */

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
      * Offset 18: MIDI Slot A = 0x0a = 10
      * Offset 19: MIDI Slot B = 0x0b = 11
      * Offset 20: MIDI Slot C = 0x0c = 12
      * Offset 21: MIDI Slot D = 0x0d = 13
      * Offset 22: Global chan = 0x0f = 15
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

    /* Performance data parsing - matching g2ctl's BitStream implementation:
     * data = perfData[4:] (skip 4-byte header)
     * parse_name(data) returns (name, remaining starting at byte after name)
     * g2ctl: BitStream(data, 8*4) positions at bit 32
     * Focus is bits 4-5 of byte 4 of remaining
      */
    if (perfData[0] != 0) {
        parse_name(perfData + 4, perfName, sizeof(perfName));
    }

    const uint8_t *remaining = perfData + 4;

    char tmpName[32];
    nameLen = parse_name(remaining, tmpName, sizeof(tmpName));

    remaining += nameLen;  /* Skip past name */

    /* g2ctl's BitStream(data, 8*4) reads at bit position 32
     * Focus is 2 bits at bit 36 (after 4 bits skip + 2 bits focus)
     * Extract using proper bitstream formula: word bits 30-31
      */
    const uint8_t *perfSettings = remaining + 4;  /* Byte 4 of remaining = bit 32 position */

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
    const uint8_t *slotPtr = remaining + 11;

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

    if (ensure_connected(1) < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return NULL;
        }

    /* Drain stale notifications left over from any prior command or session
     * before issuing GET_SYNTH_SETTINGS — same guard used in g2_get_patch(). */
    g2_drain_pending();

    /* Step 1: Send GET_SYNTH_SETTINGS (0x02) */
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        fprintf(stderr, "Failed to send synth settings command\n");
        return NULL;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2\n");
        return NULL;
    }

    msgType = response[0] & 0x0f;
    if (msgType != RESPONSE_TYPE_EXTENDED) {
        fprintf(stderr, "Unexpected response type %d\n", msgType);
        return NULL;
    }

    size = (response[1] << 8) | response[2];
    bulkData = malloc(size);
    if (!bulkData) {
        fprintf(stderr, "Memory allocation failed\n");
        return NULL;
    }
    bulkSize = size;

    if (recv_bulk(bulkData, size) <= 0) {
        fprintf(stderr, "Failed to read bulk data\n");
        free(bulkData);
        return NULL;
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
        ret = recv_interrupt(selsInterrupt, 16, USB_TIMEOUT_STANDARD);

        if (ret > 0 && (selsInterrupt[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            size = (selsInterrupt[1] << 8) | selsInterrupt[2];
            recv_bulk(selsData, size);
        }
    }

    perfData = malloc(1024);
    if (!perfData) {
        fprintf(stderr, "Memory allocation failed\n");
        free(bulkData);
        return NULL;
    }

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
        for (size_t j = 0; j < perfSize; j++) {
            fprintf(stderr, "%02x", perfData[j]);
        }
        fprintf(stderr, "\n");
    }

    /* Parse settings data and build JSON */
    cJSON *root = g2_parse_settings(bulkData, bulkSize, perfData, perfSize);

    free(bulkData);
    free(perfData);

    if (!root) {
        fprintf(stderr, "Failed to parse settings\n");
        return NULL;
    }

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
    int connected = 0;

    /* Ensure connected first */
    if (ensure_connected(1) < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return NULL;
        }

    /* Parse slot parameter - required */
    if (slot_str == NULL) {
        fprintf(stderr, "Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        fprintf(stderr, "Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    actual_slot = slot;

    /* Flush any stale G2 data left in the USB FIFO from a previous command */
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

    /* Step 1: Get version for the slot */
    /* Send: [CMD_SYS, 0x41, 0x35, slot] */
    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        fprintf(stderr, "Failed to send get patch version command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2 for patch version\n");
        goto cleanup;
    }

    /* g2ctl extracts version from embedded message.
     * Embedded response format: [length][data...][CRC]
     * g2ctl returns data starting at index 1 (after length byte), so response[5] = byte[6] of raw
     */
    version = interruptResp[6];

    /* Step 2: Get patch data with version */
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        fprintf(stderr, "Failed to send get patch command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No interrupt response for patch data\n");
        goto cleanup;
    }

    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        fprintf(stderr, "Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    patchData = malloc(patchSize);
    if (!patchData) {
        fprintf(stderr, "Memory allocation failed\n");
        goto cleanup;
    }

    ret = recv_bulk(patchData, patchSize);
    if (ret <= 0) {
        fprintf(stderr, "Failed to read patch bulk data\n");
        free(patchData);
        patchData = NULL;
        goto cleanup;
    }

    /* Step 3: Get patch name */
    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        fprintf(stderr, "Failed to send get patch name command\n");
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

    if (connected) {
        g2_disconnect();
    }

    return root;

cleanup:
    if (patchData) {
        free(patchData);
    }
    if (connected) {
        g2_disconnect();
    }
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
    int connected = 0;

    if (ensure_connected(1) < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return NULL;
        }

    if (slot_str == NULL) {
        fprintf(stderr, "Slot required (A, B, C, or D)\n");
        goto cleanup;
    }
    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        fprintf(stderr, "Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        goto cleanup;
    }
    actual_slot = slot;

    fprintf(stderr, "Fetching patch from slot %c...\n", "ABCD"[slot]);

    uint8_t cmd1[2] = {SUB_COMMAND_GET_PATCH_VERSION, (uint8_t)actual_slot};
    if (send_system_data(0x41, cmd1, sizeof(cmd1)) < 0) {
        fprintf(stderr, "Failed to send get patch version command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2 for patch version\n");
        goto cleanup;
    }
    version = interruptResp[6];

    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_SLOT, NULL, 0) < 0) {
        fprintf(stderr, "Failed to send get patch command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No interrupt response for patch data\n");
        goto cleanup;
    }

    if ((interruptResp[0] & 0x0f) != RESPONSE_TYPE_EXTENDED) {
        fprintf(stderr, "Unexpected response type for patch data\n");
        goto cleanup;
    }

    patchSize = (interruptResp[1] << 8) | interruptResp[2];
    patchData = malloc(patchSize);
    if (!patchData) {
        fprintf(stderr, "Memory allocation failed\n");
        goto cleanup;
    }

    ret = recv_bulk(patchData, patchSize);
    if (ret <= 0) {
        fprintf(stderr, "Failed to read patch bulk data\n");
        goto cleanup;
    }

    char patchName[32] = {0};
    if (send_slot(actual_slot, version, SUB_COMMAND_GET_PATCH_NAME, NULL, 0) < 0) {
        fprintf(stderr, "Failed to send get patch name command\n");
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
        fprintf(stderr, "Memory allocation failed for PCH2 conversion\n");
        goto cleanup;
    }

    if (patch_usb_to_pch2(patchData, patchSize, pch2Data, &pch2Size) < 0) {
        fprintf(stderr, "Failed to convert patch to PCH2 format\n");
        free(pch2Data);
        goto cleanup;
    }

    FILE *f = fopen(filename, "wb");
    if (!f) {
        fprintf(stderr, "Failed to open file '%s' for writing\n", filename);
        free(pch2Data);
        goto cleanup;
    }

    size_t written = fwrite(pch2Data, 1, pch2Size, f);
    fclose(f);
    free(pch2Data);

    if (written != pch2Size) {
        fprintf(stderr, "Failed to write complete file\n");
        goto cleanup;
    }

    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "file", filename);
    cJSON_AddStringToObject(result, "slot", (char*[]){ "a", "b", "c", "d" }[slot]);
    cJSON_AddStringToObject(result, "name", patchName);
    cJSON_AddNumberToObject(result, "size", (int)pch2Size);

    if (patchData) {
        free(patchData);
    }
    if (connected) {
        g2_disconnect();
    }

    return result;

cleanup:
    if (patchData) {
        free(patchData);
    }
    if (connected) {
        g2_disconnect();
    }
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

/* Drain any pending interrupt+bulk messages left in USB buffers after a command
 * that triggers a burst of unsolicited G2 notifications (e.g. slot change). */
static int g2_drain_pending(void) {
    uint8_t response[16];
    int ret, count = 0;
    while ((ret = recv_interrupt(response, sizeof(response), 50)) > 0) {
        count++;
        if ((response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t size = ((uint16_t)response[1] << 8) | response[2];
            if (size > 0) {
                uint8_t *bulk = malloc(size);
                if (bulk) { recv_bulk(bulk, size); free(bulk); }
            }
        }
    }
    (void)count;
    return count;
}

int g2_select_slot(const char *slot_str) {
    int slot;
    uint8_t response[16] = {0};
    uint8_t version;
    uint8_t mask;
    uint8_t data[8] = {0};

    if (ensure_connected(0) < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return G2_ERR_CONNECT;
        }

    slot = parse_slot(slot_str);
    if (slot < 0 || slot > 3) {
        fprintf(stderr, "Invalid slot: %s (use A, B, C, or D)\n", slot_str);
        return G2_ERR_INVALID_PARAM;
    }

    version = get_version_for_slot(slot);

    mask = 0x08 >> slot;
    data[0] = 0x07;
    data[1] = mask;
    data[2] = 0x0f;
    data[3] = mask;
    if (send_system_data(version, data, 4) < 0) {
        fprintf(stderr, "Failed to send slot command 2\n");
        return G2_ERR_SEND;
    }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);

    data[0] = 0x09;
    data[1] = slot;
    if (send_system_data(version, data, 2) < 0) {
        fprintf(stderr, "Failed to send slot command 3\n");
        return G2_ERR_SEND;
    }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);

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
            fprintf(stderr, "Not connected to G2\n");
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
                fprintf(stderr, "Failed to send list command\n");
                if (root) cJSON_Delete(root);
                return NULL;
            }

            ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
        fprintf(stderr, "Invalid variation: %d (must be 1-8)\n", variation);
        return G2_ERR_INVALID_PARAM;
    }

    if (ensure_connected(0) < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return G2_ERR_CONNECT;
        }

    if (slot < 0 || slot > 3) {
        fprintf(stderr, "Slot required (A, B, C, or D)\n");
        return G2_ERR_INVALID_PARAM;
    }

    /* Step 1: Send [CMD_SYS, 0x41, 0x35, slot] to get slot info */
    uint8_t cmdData[4] = {0x35, (uint8_t)slot};
    if (send_system_data(0x41, cmdData, 2) < 0) {
        fprintf(stderr, "Failed to send variation command 1\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(slota, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        fprintf(stderr, "No response from G2 for variation command 1\n");
        return G2_ERR_RECV;
    }
    uint8_t version = slota[6];

    /* Step 2: Send [CMD_A + slot, version, 0x6a, variation - 1]
     * Version comes from slota[6] (matches Python embedded_message output) */
    extraData[0] = variation - 1;
    if (send_slot(slot, version, 0x6a, extraData, 1) < 0) {
        fprintf(stderr, "Failed to send variation command 2\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt_with_retry(response, 16, USB_TIMEOUT_STANDARD, 5);

    return (ret > 0) ? G2_OK : G2_ERR_RECV;
}

volatile int g2_watch_running = 1;

void g2_watch_stop(int sig) {
    (void)sig;
    g2_watch_running = 0;
}


#define BULK_REARM 1  /* caller should re-send START_COMM */

/* Returns BULK_REARM if the G2 will stop sending after this message. */
static int process_bulk_event(const uint8_t *bulk, int bret) {
    if (bret <= 6) return 0;
    uint8_t baCmd    = bulk[1];
    uint8_t bversion = bulk[2];
    uint8_t bsubCmd  = bulk[3];
    int dataEnd      = bret - 2;

    if (baCmd == 0x04 && bversion == 0x40 && bsubCmd == 0x1f) {
        /* All-slots version update — sent as the final message of a full
         * performance switch.  The G2 stops sending after this until
         * START_COMM is re-sent. */
        printf("{\"type\":\"version_update\",\"scope\":\"all_slots\"}\n");
        fflush(stdout);
        return BULK_REARM;
    }

    if (baCmd == 0x04) {
        if (bsubCmd == 0x29) {
            char name[17] = {0};
            int n = 0;
            for (int i = 4; i < dataEnd && n < 16 && bulk[i]; i++)
                name[n++] = (char)bulk[i];
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
                printf("{\"type\":\"led_data\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x3A:
                printf("{\"type\":\"volume_data\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
            case 0x72:
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"data\":[", bslot);
                for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                printf("]}\n"); fflush(stdout); break;
        }
    }
    return 0;
}

int g2_watch(output_format_t format, int debug) {
    uint8_t response[16] = {0};
    int ret;
    (void)format;

    if (ensure_connected(1) < 0) {
        fprintf(stderr, "watch: failed to connect\n");
        return G2_ERR_CONNECT;
    }

    signal(SIGINT, g2_watch_stop);
    signal(SIGTERM, g2_watch_stop);

    /* Arm G2 to send unsolicited notifications (StartComm = 0x7d 0x00) */
    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    ret = send_system_data(0x41, start_cmd, 2);
    if (ret < 0) {
        fprintf(stderr, "watch: failed to send StartComm\n");
        return G2_ERR;
    }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    fprintf(stderr, "watch: armed, response len=%d", ret);
    if (ret > 0) {
        for (int i = 0; i < ret && i < 8; i++) fprintf(stderr, " %02x", response[i]);
    }
    fprintf(stderr, "\n");

    while (g2_watch_running) {
        ret = recv_interrupt(response, sizeof(response), 100);
        if (ret <= 0) continue;

        if (debug) {
            printf("{\"type\":\"raw_interrupt\",\"hex\":\"");
            for (int i = 0; i < ret; i++) { if (i) printf(" "); printf("%02x", response[i]); }
            printf("\"}\n"); fflush(stdout);
        }

        uint8_t msgType = response[0] & 0x0f;

        /* Extended message: G2 has bulk data pending — drain it or it blocks notifications.
         * Bulk payload format:
         *   [0]=0x01  [1]=aCmd (0=slotA,1=B,2=C,3=D,4=perf,0x0C=sys)
         *   [2]=version  [3]=subCmd  [4..end-3]=data  [end-2..end-1]=CRC
         * LED (0x39): 1 unknown prefix byte, then 4 LEDs/byte (2-bit), FX then VA.
         * Volume (0x3A): pairs (unknown, value) per strip, FX then VA. */
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
                            /* G2 stops unsolicited data after full performance switch;
                             * re-arm it (Delphi does the same via SynthStartStopCommunication) */
                            uint8_t arm[2] = {SUB_COMMAND_START_STOP, 0x00};
                            send_system_data(0x41, arm, 2);
                        }
                    }
                    free(bulk);
                }
            }
            continue;
        }

        if (msgType != RESPONSE_TYPE_EMBEDDED) continue;

        /*
         * Embedded notification layout (Delphi BVE.NMG2USB.pas USBProcessResponseMessage
         * skips byte[0], so MemStream reads start at byte[1]):
         *   [0] = (len<<4)|2   header; len covers bytes[1..len], last 2 are CRC
         *   [1] = aR           routing byte (always 0x01)
         *   [2] = aCmd         0x00/0x08=slot A, 0x01/0x09=slot B, 0x02/0x0A=slot C,
         *                      0x03/0x0B=slot D, 0x04=perf, 0x0C=sys
         *   [3] = version      patch/perf version (or 0x40 for version-update messages)
         *   [4] = subCmd       S_SET_PARAM=0x40, R_LED=0x39, R_VOL=0x3A, etc.
         *   [5..] = data
         */
        uint8_t aCmd    = response[2];
        uint8_t version = response[3];
        uint8_t subCmd  = response[4];
        /* last data byte index = (len field) - 2 (excludes 2 CRC bytes) */
        int lastByte = (response[0] >> 4) - 2;
        if (lastByte > 15) lastByte = 15;

        /* ---- System messages (aCmd == 0x0C) ---- */
        if (aCmd == 0x0C) {
            if (version == 0x40) {
                /* Version-update messages */
                switch (subCmd) {
                    case 0x1F: /* perf + all slot versions */
                        printf("{\"type\":\"version_update\",\"perf_version\":%u}\n", response[5]);
                        break;
                    case 0x36: /* single slot/perf version */
                    case 0x38:
                        printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                               response[5], response[6]);
                        break;
                    default:
                        printf("{\"type\":\"unknown_sys\",\"version\":64,\"sub\":%u}\n", subCmd);
                        break;
                }
            } else {
                switch (subCmd) {
                    case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
                    case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
                    default:
                        printf("{\"type\":\"unknown_sys\",\"sub\":%u}\n", subCmd);
                        break;
                }
            }
            fflush(stdout);
            continue;
        }

        /* ---- Performance messages (aCmd == 0x04) ---- */
        if (aCmd == 0x04) {
            switch (subCmd) {
                case 0x09: /* S_SEL_SLOT */
                    printf("{\"type\":\"slot_change\",\"slot\":%u}\n", response[5]);
                    break;
                case 0x05: /* R_ASSIGNED_VOICES: 4 bytes = voices per slot */
                    printf("{\"type\":\"assigned_voices\",\"voices\":[%u,%u,%u,%u]}\n",
                           response[5], response[6], response[7], response[8]);
                    break;
                case 0x29: { /* C_PERF_NAME: null-terminated performance name */
                    char name[17] = {0};
                    int n = 0;
                    for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                        name[n++] = (char)response[i];
                    printf("{\"type\":\"perf_name\",\"name\":\"%s\"}\n", name);
                    break;
                }
                case 0x11: /* C_PERF_SETTINGS */
                case 0x10: /* Q_PERF_SETTINGS */
                    printf("{\"type\":\"perf_settings_update\"}\n");
                    break;
                case 0x3F: /* S_SET_MASTER_CLOCK: [5]=unknown [6]=type(0=run,1=bpm) [7]=value */
                    if (response[6] == 0x00)
                        printf("{\"type\":\"master_clock_run\",\"run\":%u}\n", response[7]);
                    else
                        printf("{\"type\":\"master_clock_bpm\",\"bpm\":%u}\n", response[7]);
                    break;
                case 0x5D: /* R_EXT_MASTER_CLOCK: [5]=unknown [6..7]=value */
                    printf("{\"type\":\"ext_master_clock\",\"value\":%u}\n",
                           (response[6] << 8) | response[7]);
                    break;
                case 0x80: /* R_MIDI_CC: [5]=unknown [6]=cc */
                    printf("{\"type\":\"midi_cc\",\"cc\":%u}\n", response[6]);
                    break;
                case 0x7F: printf("{\"type\":\"ok\"}\n"); break;
                case 0x7E: printf("{\"type\":\"error\",\"code\":%u}\n", response[5]); break;
                default:
                    printf("{\"type\":\"unknown_perf\",\"sub\":%u}\n", subCmd);
                    break;
            }
            fflush(stdout);
            continue;
        }

        /* ---- Slot messages (aCmd 0x00-0x03 or 0x08-0x0B) ---- */
        uint8_t slot = aCmd & 0x03;

        /* version=0x40 means version-update message at slot level */
        if (version == 0x40) {
            if (subCmd == 0x36 || subCmd == 0x38) /* R_PATCH_VERSION */
                printf("{\"type\":\"patch_version\",\"slot\":%u,\"version\":%u}\n",
                       response[5], response[6]);
            else
                printf("{\"type\":\"unknown_version\",\"slot\":%u,\"sub\":%u}\n", slot, subCmd);
            fflush(stdout);
            continue;
        }

        switch (subCmd) {
            case 0x40: /* S_SET_PARAM: location(0=fx,1=va,2=patch), module, param, value, variation */
                if (response[5] == 2) {
                    printf("{\"type\":\"patch_param\",\"slot\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[7], response[8], response[9]);
                } else {
                    printf("{\"type\":\"param_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[5] == 0 ? "fx" : "va",
                           response[6], response[7], response[8], response[9]);
                }
                break;
            case 0x27: { /* S_PATCH_NAME: null-terminated patch name */
                char name[17] = {0};
                int n = 0;
                for (int i = 5; i <= lastByte && n < 16 && response[i]; i++)
                    name[n++] = (char)response[i];
                printf("{\"type\":\"patch_name\",\"slot\":%u,\"name\":\"%s\"}\n", slot, name);
                break;
            }
            case 0x44: /* S_COPY_VARIATION: from, to */
                printf("{\"type\":\"copy_variation\",\"slot\":%u,\"from\":%u,\"to\":%u}\n",
                       slot, response[5], response[6]);
                break;
            case 0x6A: /* S_SEL_VARIATION */
                printf("{\"type\":\"variation_change\",\"slot\":%u,\"variation\":%u}\n",
                       slot, response[5]);
                break;
            case 0x2F: /* S_SEL_PARAM: unknown, location, module, param */
                printf("{\"type\":\"selected_param\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u}\n",
                       slot, response[6] == 0 ? "fx" : (response[6] == 1 ? "va" : "patch"),
                       response[7], response[8]);
                break;
            case 0x21: /* C_PATCH_DESCR: patch data loaded */
            case 0x3C: /* Q_PATCH: patch update complete */
                printf("{\"type\":\"patch_update\",\"slot\":%u}\n", slot);
                break;
            case 0x69: /* C_CURRENT_NOTE_2: note on/off */
                printf("{\"type\":\"current_note\",\"slot\":%u,\"note\":%u,\"velocity\":%u}\n",
                       slot, response[5], response[6]);
                break;
            case 0x72: /* R_RESOURCES_USED */
                printf("{\"type\":\"resources_used\",\"slot\":%u,\"location\":%u}\n",
                       slot, response[5]);
                break;
            case 0x59: /* M_UNKNOWN_2 */
            case 0x70: /* M_UNKNOWN_6 */
            case 0x7F: printf("{\"type\":\"ok\",\"slot\":%u}\n", slot); break;
            case 0x7E: printf("{\"type\":\"error\",\"slot\":%u,\"code\":%u}\n", slot, response[5]); break;
            default:
                printf("{\"type\":\"unknown\",\"slot\":%u,\"cmd\":%u,\"sub\":%u}\n",
                       slot, aCmd, subCmd);
                break;
        }
        fflush(stdout);
    }

    /* Disarm G2 so it stops streaming and subsequent commands work normally */
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);

    signal(SIGINT, SIG_DFL);
    signal(SIGTERM, SIG_DFL);

    return 0;
}