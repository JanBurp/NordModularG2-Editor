/*
 * G2 CLI - Utility functions
 */

#include "utils.h"
#include "defs.h"
#include <string.h>

uint16_t crc_iterator(int32_t seed, int32_t val) {
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

uint16_t calc_crc16(uint8_t *buff, int length) {
    uint16_t crc = 0;
    for (int i = 0; i < length; i++) {
        crc = crc_iterator(crc, buff[i]);
    }
    return crc;
}

int parse_name(const uint8_t *data, char *buf, size_t bufsize) {
    size_t i;
    for (i = 0; i < 16 && i < bufsize - 1; i++) {
        if (data[i] >= 0x20 && data[i] <= 0x7f) {
            buf[i] = data[i];
        } else {
            break;
        }
    }
    buf[i] = '\0';
    if (i < 16 && data[i] == 0) {
        return (int)(i + 1);
    }
    return (int)i;
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

int patch_usb_to_pch2(const uint8_t *usb_data, size_t usb_len,
                      uint8_t *pch2_data, size_t *pch2_len) {
    if (usb_data == NULL || pch2_data == NULL || pch2_len == NULL) {
        return -1;
    }

    if (usb_len < PCH2_USB_CHUNK2_START + PCH2_USB_TAIL_SIZE) {
        return -1;
    }

    size_t first_part  = PCH2_USB_CHUNK1_END - PCH2_USB_DATA_OFFSET;
    size_t second_part = usb_len - PCH2_USB_CHUNK2_START - PCH2_USB_TAIL_SIZE;
    size_t required    = first_part + second_part;
    if (*pch2_len < required) {
        *pch2_len = required;
        return -1;
    }

    memcpy(pch2_data,             usb_data + PCH2_USB_DATA_OFFSET,   first_part);
    memcpy(pch2_data + first_part, usb_data + PCH2_USB_CHUNK2_START, second_part);
    *pch2_len = required;
    return 0;
}

int tokenize_command(char *buf, char **argv_out, int max_argc) {
    int argc = 0;
    char *p = buf;
    while (*p && argc < max_argc) {
        while (*p == ' ' || *p == '\t') p++;
        if (*p == '\0') break;
        argv_out[argc++] = p;
        while (*p && *p != ' ' && *p != '\t') p++;
        if (*p) *p++ = '\0';
    }
    return argc;
}

int patch_pch2_to_usb(const uint8_t *pch2_data, size_t pch2_len,
                      uint8_t *usb_data, size_t *usb_len) {
    if (pch2_data == NULL || usb_data == NULL || usb_len == NULL) {
        return -1;
    }
    
    size_t required = PCH2_USB_DATA_OFFSET + pch2_len + PCH2_USB_TAIL_SIZE;
    if (*usb_len < required) {
        *usb_len = required;
        return -1;
    }

    usb_data[0] = 0x01;
    usb_data[1] = (pch2_len >> 8) & 0xff;
    usb_data[2] = pch2_len & 0xff;
    memcpy(usb_data + PCH2_USB_DATA_OFFSET, pch2_data, pch2_len);

    uint16_t crc = calc_crc16(usb_data + PCH2_USB_DATA_OFFSET, pch2_len);
    usb_data[PCH2_USB_DATA_OFFSET + pch2_len]     = (crc >> 8) & 0xff;
    usb_data[PCH2_USB_DATA_OFFSET + pch2_len + 1] = crc & 0xff;
    
    *usb_len = required;
    return 0;
}
