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

int g2_daemon_mode = 0;

static void g2_err(const char *fmt, ...) {
    char msg[256];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);
    size_t len = strlen(msg);
    if (len > 0 && msg[len - 1] == '\n') msg[--len] = '\0';
    if (g2_daemon_mode) {
        printf("{\"type\":\"error\",\"error\":\"%s\"}\n", msg);
        fflush(stdout);
    } else {
        fprintf(stderr, "%s\n", msg);
    }
}
/* Timeout values (in ms) */
#define USB_TIMEOUT_STANDARD 100
#define USB_TIMEOUT_LONG    2000

/* Delay after USB send (in us) */
#define USB_SEND_DELAY_US    10000

/* Command message building */
#define COMMAND_OFFSET 2

static int recv_interrupt(uint8_t *response, int size, int timeout_ms);
static int recv_bulk(uint8_t *data, uint16_t size);
static int send_system(uint8_t cmd, uint8_t subcmd);
static int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen);
static int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
                     const uint8_t *extra, size_t extraLen);
static int g2_drain_pending(void);

static int ensure_connected(int silent) {
    if (g2_is_connected()) {
        return 0;
    }
    return silent ? g2_connect_silent() : g2_connect();
}

int g2_init(void) {
    int ret = libusb_init(&g2.ctx);
    if (ret < 0) {
        g2_err("Failed to initialize libusb: %s\n", libusb_error_name(ret));
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
        g2_err("Failed to get device list\n");
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
        g2_err("G2 not found (VID=%04x, PID=%04x)\n", VENDOR_ID, PRODUCT_ID);
        return G2_ERR_NOT_FOUND;
    }

    g2_err("G2 found, connecting...\n");

    /* Claim interface 0 */
    ret = libusb_claim_interface(g2.handle, 0);
    if (ret < 0) {
        g2_err("Failed to claim interface: %s\n", libusb_error_name(ret));
        libusb_close(g2.handle);
        g2.handle = NULL;
        return G2_ERR_CLAIM_INTERFACE;
    }

    g2.interface_claimed = 1;
    g2_err("Connected to G2\n");
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
        g2_err("Failed to send init message\n");
        return G2_ERR_SEND;
    }
    usleep(USB_SEND_DELAY_US);

    int ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
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
            g2_err("Unexpected init response data: %02x\n", first);
            return G2_ERR_RECV;
        }
    }

    return G2_OK;
}

int g2_send_command(uint8_t *data, int length) {
    int transferred = 0;
    int ret;

    if (!g2.handle) {
        g2_err("Not connected\n");
        return G2_ERR;
    }

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD);
    if (ret == LIBUSB_ERROR_PIPE) {
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD);
    }
    if (ret < 0) {
        g2_err("Write failed: %s\n", libusb_error_name(ret));
        return G2_ERR_SEND;
    }

    return transferred;
}

int g2_recv_response(uint8_t *buffer, int size, int timeout_ms) {
    int transferred = 0;
    int ret;

    if (!g2.handle) {
        g2_err("Not connected\n");
        return G2_ERR;
    }

    /* G2-Edit uses bulk_transfer on endpoint 0x81 (interrupt endpoint) */
    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, buffer, size, &transferred, timeout_ms);
    if (ret < 0) {
        if (ret == LIBUSB_ERROR_TIMEOUT) {
            return 0;  /* Timeout - no data */
        }
        g2_err("Read failed: %s\n", libusb_error_name(ret));
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
    uint8_t buff[2048] = {0};
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
    if (ret == LIBUSB_ERROR_PIPE) {
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    }
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
        if (ret == LIBUSB_ERROR_NO_DEVICE) return LIBUSB_ERROR_NO_DEVICE;
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

    /* Verified offsets from raw device dump (synth name "TheBurp", 7 chars + null):
      * Offset 14: Perf Mode
      * Offset 15: Perf Bank / location
      * Offset 16: ?
      * Offset 17: MIDI Slot A (0-indexed, +1 = MIDI channel 1-16)
      * Offset 18: MIDI Slot B
      * Offset 19: MIDI Slot C
      * Offset 20: MIDI Slot D
      * Offset 21: MIDI Global channel
      * Offset 22: Sysex ID (CLI adds 1 when reporting)
      * Offset 23: Local on (bit 7)
      * Offset 24: Prog Change Rcv (bit 0), Snd (bit 1)
      * Offset 25: Send Clock (bit 1), Receive Clock (bit 0)
      */
    /* Mode is bit 7 of byte after null terminator (bulkData[13]) */
    mode = (bulkData[13] >> 7) & 1;  /* mode (bit 7) */
    midiCh[0] = bulkData[17] + 1;  /* MIDI A (0-indexed stored, +1 = channel 1-16) */
    midiCh[1] = bulkData[18] + 1;  /* MIDI B */
    midiCh[2] = bulkData[19] + 1;  /* MIDI C */
    midiCh[3] = bulkData[20] + 1;  /* MIDI D */
    midiCh[4] = bulkData[21] + 1;  /* MIDI global */
    sysexId = bulkData[22];  /* sysex */
    localOn = (bulkData[23] >> 7) & 1;  /* local (bit 7) */
    prgch = ((bulkData[24] >> 0) & 1) | ((bulkData[24] >> 1) & 1) << 1;  /* Rcv at bit 0, Snd at bit 1 */
    clkSend = !((bulkData[25] >> 1) & 1);  /* clkse (bit 1, inverted: 0=on) */
    clkRecv = bulkData[25] & 1;  /* clkre (bit 0) */
    tuneCent = bulkData[28];  /* tune cent */
    tuneSemi = bulkData[30];  /* tune semi */
    pedalPolarity = bulkData[32] & 1;  /* pedal polarity (bit 0) */
    pedalGain = bulkData[34];  /* pedal gain */

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
    const uint8_t *perfEnd = perfData + perfSize;

    /* Now parse each slot, guarded by perfSize */
    for (int i = 0; i < 4; i++) {
        if (slotPtr >= perfEnd) break;
        int maxName = (int)(perfEnd - slotPtr);
        if (maxName > 17) maxName = 17;
        nameLen = parse_name(slotPtr, slotNames[i], maxName);
        slotPtr += nameLen;

        if (slotPtr + 7 > perfEnd) break;
        slotActive[i] = slotPtr[0] & 1;
        slotKey[i]    = slotPtr[1] & 1;
        slotHold[i]   = slotPtr[2] & 1;
        slotBanks[i]  = slotPtr[3];
        slotPatches[i] = slotPtr[4];
        slotLow[i]    = slotPtr[5];
        slotHigh[i]   = slotPtr[6];

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
            g2_err("Failed to connect to G2\n");
            return NULL;
        }

    /* Drain stale notifications left over from any prior command or session
     * before issuing GET_SYNTH_SETTINGS — same guard used in g2_get_patch(). */
    g2_drain_pending();

    /* Step 1: Send GET_SYNTH_SETTINGS (0x02) */
    if (send_system(0x41, SUB_COMMAND_GET_SYNTH_SETTINGS) < 0) {
        g2_err("Failed to send synth settings command\n");
        return NULL;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
    if (ret <= 0) {
        g2_err("No response from G2\n");
        return NULL;
    }

    msgType = response[0] & 0x0f;
    if (msgType != RESPONSE_TYPE_EXTENDED) {
        g2_err("Unexpected response type %d\n", msgType);
        return NULL;
    }

    size = (response[1] << 8) | response[2];
    bulkData = malloc(size);
    if (!bulkData) {
        g2_err("Memory allocation failed\n");
        return NULL;
    }
    bulkSize = size;

    if (recv_bulk(bulkData, size) <= 0) {
        g2_err("Failed to read bulk data\n");
        free(bulkData);
        return NULL;
    }

    if (debug && !g2_daemon_mode) {
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
        g2_err("Memory allocation failed\n");
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

    if (debug && !g2_daemon_mode) {
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
        g2_err("Failed to parse settings\n");
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
        g2_err("Failed to send get patch version command\n");
        goto cleanup;
    }

    usleep(USB_SEND_DELAY_US);

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
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

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
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

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
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

    ret = recv_interrupt(interruptResp, 16, USB_TIMEOUT_STANDARD);
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
        int pv_ret = recv_interrupt(pv_resp, 16, USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);

    /* Step 2: set active slot index */
    data[0] = 0x09;
    data[1] = slot;
    if (send_system_data(version, data, 2) < 0) {
        g2_err("Failed to send slot command 2\n");
        return G2_ERR_SEND;
    }
    recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
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
        int n = recv_interrupt(response, 16, USB_TIMEOUT_STANDARD);
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

    ret = recv_interrupt_with_retry(slota, 16, USB_TIMEOUT_STANDARD, 5);
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
    ret = recv_interrupt_with_retry(response, 16, USB_TIMEOUT_STANDARD, 5);

    return (ret > 0) ? G2_OK : G2_ERR_RECV;
}

/* Helper: get version for slot using GET_PATCH_VERSION (shared pattern) */
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
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
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
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
                                   msgLength, &transferred, USB_TIMEOUT_STANDARD);
    return (ret < 0) ? G2_ERR_SEND : G2_OK;
    /* No recv_interrupt — WRITE_NO_RESP */
}

volatile int g2_watch_running = 1;
int g2_watch_verbose = 1;
void (*g2_watch_tick_hook)(void) = NULL;

void g2_watch_stop(int sig) {
    (void)sig;
    g2_watch_running = 0;
}

/* Send STOP_COMM so the G2 stops streaming and normal commands work again. */
int g2_watch_disarm(void) {
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    /* Use g2_drain_pending (not a bare recv_interrupt) so that any EXTENDED
     * interrupt arriving here has its bulk data consumed — an unread bulk
     * blocks the G2 from sending further interrupts, including the response
     * to GET_PATCH_VERSION in g2_select_variation. */
    g2_drain_pending();
    return G2_OK;
}

/* Drain stale data, send START_COMM to re-arm unsolicited notifications. */
int g2_watch_rearm(void) {
    uint8_t response[16];
    g2_drain_pending();
    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    if (send_system_data(0x41, start_cmd, 2) < 0) return G2_ERR_SEND;
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    return G2_OK;
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
                if (g2_watch_verbose) {
                    printf("{\"type\":\"led_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
            case 0x3A:
                if (g2_watch_verbose) {
                    printf("{\"type\":\"volume_data\",\"slot\":%u,\"data\":[", bslot);
                    for (int i = 4; i < dataEnd; i++) { if (i > 4) printf(","); printf("%u", bulk[i]); }
                    printf("]}\n"); fflush(stdout);
                }
                break;
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
        g2_err("watch: failed to connect\n");
        return G2_ERR_CONNECT;
    }

    signal(SIGINT, g2_watch_stop);
    signal(SIGTERM, g2_watch_stop);

    /* Clear any stale notifications from a preceding command (e.g. slot switch)
     * before arming — sending START_COMM while the G2 is still flushing its
     * notification burst can stall the bulk-OUT endpoint. */
    g2_drain_pending();

    /* Clear any halted endpoints left over from a previous bad session.
     * The output endpoint is already cleared on-demand in send_slot/g2_send_command,
     * but the input endpoints are never cleared otherwise. */
    libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
    libusb_clear_halt(g2.handle, ENDPOINT_INTERRUPT_IN);
    libusb_clear_halt(g2.handle, ENDPOINT_BULK_IN);

    /* Arm G2 to send unsolicited notifications (StartComm = 0x7d 0x00) */
    uint8_t start_cmd[2] = {SUB_COMMAND_START_STOP, 0x00};
    ret = send_system_data(0x41, start_cmd, 2);
    if (ret < 0) {
        g2_err("watch: failed to send StartComm\n");
        return G2_ERR;
    }
    usleep(USB_SEND_DELAY_US);
    ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    printf("{\"type\":\"watch_armed\"}\n");
    fflush(stdout);

    if (ret <= 0) {
        /* G2 is connected but not responding — bad state (halted endpoint,
         * firmware stuck, etc.). Emit event, disconnect, and wait for it to
         * come back using the same reconnect loop used inside the watch. */
        printf("{\"type\":\"device_bad_state\"}\n");
        fflush(stdout);
        g2_disconnect();
        while (g2_watch_running) {
            if (g2_connect_silent() >= 0) break;
            usleep(100000);
        }
        if (!g2_watch_running) return G2_OK;
        g2_drain_pending();
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
        libusb_clear_halt(g2.handle, ENDPOINT_INTERRUPT_IN);
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_IN);
        ret = send_system_data(0x41, start_cmd, 2);
        if (ret < 0) {
            g2_err("watch: failed to re-arm after bad state\n");
            return G2_ERR;
        }
        usleep(USB_SEND_DELAY_US);
        recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
        printf("{\"type\":\"device_reconnected\"}\n");
        fflush(stdout);
    }

    while (g2_watch_running) {
        if (g2_watch_tick_hook) g2_watch_tick_hook();
        ret = recv_interrupt(response, sizeof(response), 100);
        if (ret == LIBUSB_ERROR_NO_DEVICE) {
            printf("{\"type\":\"device_disconnected\"}\n");
            fflush(stdout);
            g2_disconnect();

            /* Retry immediately, then every 100 ms until cable comes back. */
            while (g2_watch_running) {
                if (g2_connect_silent() >= 0) break;
                usleep(100000);
            }
            if (!g2_watch_running) break;   /* SIGTERM during wait → clean exit */

            /* Re-arm: drain stale data, send START_COMM, recv ACK */
            g2_drain_pending();
            uint8_t start_cmd2[2] = {SUB_COMMAND_START_STOP, 0x00};
            ret = send_system_data(0x41, start_cmd2, 2);
            if (ret < 0) {
                g2_err("watch: failed to re-arm after reconnect\n");
                break;
            }
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
                             * re-arm it (Delphi does the same via SynthStartStopCommunication).
                             * Read the ack to keep the interrupt FIFO clean. */
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
                    default: {
                        char hex[32] = "";
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                            snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
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
                        for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                            snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                        printf("{\"type\":\"unknown_sys\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                        break;
                    }
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
                default: {
                    char hex[32] = "";
                    for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                        snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                    printf("{\"type\":\"unknown_perf\",\"sub\":%u,\"data\":\"%s\"}\n", subCmd, hex);
                    break;
                }
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
            else {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                    snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown_version\",\"slot\":%u,\"sub\":%u,\"data\":\"%s\"}\n", slot, subCmd, hex);
            }
            fflush(stdout);
            continue;
        }

        switch (subCmd) {
            case 0x40: /* S_SET_PARAM: location(0=fx,1=va,2=patch), module, param, value, variation */
                if (response[5] == 2) {
                    printf("{\"type\":\"patch_param\",\"slot\":%u,\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[6], response[7], response[8], response[9]);
                } else {
                    printf("{\"type\":\"param_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,\"value\":%u,\"variation\":%u}\n",
                           slot, response[5] == 0 ? "fx" : "va",
                           response[6], response[7], response[8], response[9]);
                }
                break;
            case 0x43: /* S_SET_MORPH_RANGE: location, module, param, morph, value, negative, variation */
                printf("{\"type\":\"morph_change\",\"slot\":%u,\"area\":\"%s\",\"module\":%u,\"param\":%u,"
                       "\"morph\":%u,\"value\":%u,\"negative\":%u,\"variation\":%u}\n",
                       slot, response[5] == 0 ? "fx" : "va",
                       response[6], response[7], response[8], response[9], response[10], response[11]);
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
            default: {
                char hex[32] = "";
                for (int i = 5; i <= lastByte && i - 5 < 15; i++)
                    snprintf(hex + (i-5)*2, 3, "%02x", response[i]);
                printf("{\"type\":\"unknown\",\"slot\":%u,\"cmd\":%u,\"sub\":%u,\"data\":\"%s\"}\n",
                       slot, aCmd, subCmd, hex);
                break;
            }
        }
        fflush(stdout);
    }

    /* Disarm G2 so it stops streaming and subsequent commands work normally */
    uint8_t stop_cmd[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop_cmd, 2);
    usleep(USB_SEND_DELAY_US);
    recv_interrupt(response, sizeof(response), USB_TIMEOUT_STANDARD);
    /* Flush any extended messages (with pending bulk data) that arrived before
     * STOP_COMM took effect — leaving them unread blocks subsequent commands. */
    g2_drain_pending();

    signal(SIGINT, SIG_DFL);
    signal(SIGTERM, SIG_DFL);

    return 0;
}