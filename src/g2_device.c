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

int g2_status(output_format_t format) {
    uint8_t buff[256] = {0};
    uint8_t response[8192] = {0};
    int pos = COMMAND_OFFSET;
    int msgLength;
    uint16_t crc;
    int transferred;
    int ret;

    /* Auto-connect if not connected */
    if (!g2_is_connected()) {
        if (g2_connect() < 0) {
            fprintf(stderr, "Failed to connect to G2\n");
            return -1;
        }
    }

    /* Build GET_SYNTH_SETTINGS command (same as G2-Edit) */
    buff[pos++] = 0x01;  /* Header */
    buff[pos++] = COMMAND_REQ | COMMAND_SYS;  /* 0x2c */
    buff[pos++] = 0x41;
    buff[pos++] = SUB_COMMAND_GET_SYNTH_SETTINGS;

    msgLength = pos - COMMAND_OFFSET;
    crc = calc_crc16(&buff[COMMAND_OFFSET], msgLength);

    /* Write CRC at end of data */
    buff[pos++] = (crc >> 8) & 0xff;
    buff[pos++] = crc & 0xff;
    msgLength += 4;

    /* Write length at start */
    buff[0] = (msgLength >> 8) & 0xff;
    buff[1] = msgLength & 0xff;

    /* Send command */
    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD);
    if (ret < 0) {
        fprintf(stderr, "Write failed: %s\n", libusb_error_name(ret));
        return -1;
    }

    /* Read response - interrupt transfer first */
    usleep(100000);  /* Wait 100ms for G2 to respond */
    
    ret = libusb_interrupt_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, response, 16, &transferred, USB_TIMEOUT_LONG);
    if (ret != 0 || transferred == 0) {
        fprintf(stderr, "No response from G2\n");
        return -1;
    }

    /* Parse response based on message type */
    uint8_t msgType = response[0] & 0x0f;

    if (msgType == RESPONSE_TYPE_EXTENDED) {
        /* Extended message - need to read bulk data */
        uint16_t size = (response[1] << 8) | response[2];

        /* Read bulk data */
        uint8_t *bulkData = malloc(size);
        if (!bulkData) {
            fprintf(stderr, "Memory allocation failed\n");
            return -1;
        }

        int retries = 5;
        int bulkReceived = 0;
        while (retries > 0 && bulkReceived < size) {
            ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN, bulkData + bulkReceived, size - bulkReceived, &transferred, USB_TIMEOUT_LONG);
            if (ret == 0 && transferred > 0) {
                bulkReceived += transferred;
            } else {
                retries--;
            }
        }

        if (bulkReceived > 0) {
            /* Parse synth settings from bulk data */
            /* Format: [01] [0c] [00] [03] [name...] */
            if (bulkReceived > 8) {
                char *name = (char *)(bulkData + 4);
                printf("{\"status\": \"ok\", \"performance\": \"%s\"}\n", name);
            } else {
                printf("{\"status\": \"ok\"}\n");
            }
        } else {
            printf("{\"status\": \"error\", \"message\": \"Failed to read bulk data\"}\n");
        }

        free(bulkData);
    } else {
        printf("{\"status\": \"ok\", \"message\": \"Unexpected response type %d\"}\n", msgType);
    }

    (void)format;
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
    (void)slot_str;
    fprintf(stderr, "Select slot command not yet implemented\n");
    return -1;
}

int g2_select_variation(int variation) {
    (void)variation;
    fprintf(stderr, "Select variation command not yet implemented\n");
    return -1;
}
