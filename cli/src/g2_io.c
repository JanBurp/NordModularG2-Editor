/*
 * G2 CLI - USB transport layer
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <libusb.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "utils.h"

/* Global device state */
g2_device_t g2 = {
    .ctx = NULL,
    .handle = NULL,
    .interface_claimed = 0
};

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

    g2.handle = libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    if (!g2.handle) {
        fprintf(stderr, "G2 not found (VID=%04x, PID=%04x)\n", VENDOR_ID, PRODUCT_ID);
        return G2_ERR_NOT_FOUND;
    }

    fprintf(stderr, "G2 found, connecting...\n");

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

    g2.handle = libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    if (!g2.handle) {
        return G2_ERR_NOT_FOUND;
    }

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

int g2_send_command(uint8_t *data, int length) {
    int transferred = 0;
    int ret;

    if (!g2.handle) {
        fprintf(stderr, "Not connected\n");
        return G2_ERR;
    }

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD_MS);
    if (ret == LIBUSB_ERROR_PIPE) {
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, data, length, &transferred, USB_TIMEOUT_STANDARD_MS);
    }
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

    ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, buffer, size, &transferred, timeout_ms);
    if (ret < 0) {
        if (ret == LIBUSB_ERROR_TIMEOUT) {
            return 0;
        }
        fprintf(stderr, "Read failed: %s\n", libusb_error_name(ret));
        return G2_ERR_RECV;
    }

    return transferred;
}

int send_system(uint8_t cmd, uint8_t subcmd) {
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
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    return (ret < 0) ? -1 : 0;
}

int send_system_data(uint8_t cmd, const uint8_t *extra, size_t extraLen) {
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
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    return (ret < 0) ? -1 : 0;
}

int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
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
    int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    if (ret == LIBUSB_ERROR_PIPE) {
        libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT, buff, msgLength, &transferred, USB_TIMEOUT_STANDARD_MS);
    }
    return (ret < 0) ? -1 : 0;
}

int recv_interrupt_with_retry(uint8_t *response, int size, int timeout_ms, int retries) {
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

int recv_interrupt(uint8_t *response, int size, int timeout_ms) {
    return recv_interrupt_with_retry(response, size, timeout_ms, 1);
}

int recv_bulk(uint8_t *data, uint16_t size) {
    int transferred;
    int ret;
    int retries = 5;
    int received = 0;
    while (retries > 0 && received < size) {
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN, data + received, size - received, &transferred, USB_TIMEOUT_STANDARD_MS);
        if (ret == 0 && transferred > 0) {
            received += transferred;
        } else {
            retries--;
        }
    }
    return received;
}

int send_init_msg(void) {
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
                                   &transferred, USB_TIMEOUT_STANDARD_MS);
    return (ret < 0) ? -1 : 0;
}

int g2_drain_pending(void) {
    uint8_t response[16];
    int ret, count = 0;
    while ((ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_DRAIN_MS)) > 0) {
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
