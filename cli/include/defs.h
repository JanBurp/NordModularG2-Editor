/*
 * G2 CLI - Protocol constants for the Nord Modular G2
 *
 * USB vendor/product IDs, endpoint addresses, command and response codes,
 * patch format offsets, and timing constants used throughout the CLI.
 */

#ifndef __G2_DEFS_H__
#define __G2_DEFS_H__

/* Slot types */
typedef enum {
    SLOT_A = 0,
    SLOT_B = 1,
    SLOT_C = 2,
    SLOT_D = 3,
    SLOT_CURRENT = -1,
    SLOT_INVALID = -2
} slot_t;

#define NUM_VARIATIONS                       (10)
#define NUM_GUI_VARIATIONS                   (8)
#define NUM_MORPHS                           (8)
#define MAX_PARAMS_PER_MODULE                (38)
#define MAX_CONNECTORS_PER_MODULE            (10)
#define MAX_SLOTS                            (4)

#define INTERRUPT_MESSAGE_SIZE               (16)
#define EXTENDED_MESSAGE_SIZE                (8192)
#define SEND_MESSAGE_SIZE                   (256)

#define RESPONSE_TYPE_EXTENDED               (0x1)
#define RESPONSE_TYPE_EMBEDDED               (0x2)
#define RESPONSE_TYPE_INIT                   (0x80)
#define RESPONSE_TYPE_COMMAND                (0x01)

/* Sub Commands - Queries */
#define SUB_COMMAND_GET_SYNTH_SETTINGS       (0x02)
#define SUB_COMMAND_SELECT_SLOT              (0x09)
#define SUB_COMMAND_GET_PATCH_NAME           (0x28)
#define SUB_COMMAND_GET_PATCH_VERSION        (0x35)
#define SUB_COMMAND_GET_SELECTED_PARAM       (0x2e)
#define SUB_COMMAND_GET_PATCH_SLOT           (0x3c)
#define SUB_COMMAND_SELECT_VARIATION         (0x6a)
#define SUB_COMMAND_GET_MIDI_CC              (0x81)

/* Sub Commands - Actions */
#define SUB_COMMAND_SET_PARAM                (0x40)
#define SUB_COMMAND_SET                      (0x37)  /* Upload patch to slot */
#define SUB_COMMAND_START_STOP               (0x7d)  /* Start/stop notifications */
#define START_COMM                           (0x00)  /* Arm G2 for unsolicited notifications */
#define STOP_COMM                            (0x01)  /* Disarm G2 */

/* Response types */
#define SUB_RESPONSE_SYNTH_SETTINGS          (0x03)
#define SUB_RESPONSE_PATCH_NAME              (0x27)
#define SUB_RESPONSE_PERFORMANCE_NAME        (0x29)
#define SUB_RESPONSE_PATCH_VERSION           (0x36)
#define SUB_RESPONSE_MODULE_LIST             (0x4a)
#define SUB_RESPONSE_PARAM_LIST              (0x4d)
#define SUB_RESPONSE_PARAM_CHANGE            (0x40)
#define SUB_RESPONSE_CABLE_LIST              (0x52)

/* Command types */
#define COMMAND_REQ                          (0x20)  /* High nibble, expects response */
#define COMMAND_WRITE_NO_RESP                (0x30)  /* High nibble, no response expected */
#define COMMAND_SYS                          (0x0c)  /* Low nibble - system */
#define COMMAND_SLOT                         (0x08)  /* Low nibble - slot specific */
#define COMMAND_SCOPE_SYSTEM                 (COMMAND_REQ | COMMAND_SYS)
#define COMMAND_SCOPE_SLOT(slot)             (COMMAND_REQ | COMMAND_SLOT | (slot))

/* USB Configuration */
#define VENDOR_ID                           (0x0ffc)
#define PRODUCT_ID                          (2)

/* USB Endpoints */
#define ENDPOINT_BULK_OUT                   (0x03)  /* Bulk OUT */
#define ENDPOINT_INTERRUPT_IN               (0x81)  /* Interrupt IN */
#define ENDPOINT_BULK_IN                    (0x82)  /* Bulk IN */

/* USB transfer timeouts (milliseconds) */
#define USB_TIMEOUT_STALE_MS                (20)    /* drain stale interrupt data */
#define USB_TIMEOUT_DRAIN_MS                (50)    /* drain pending notifications */
#define USB_TIMEOUT_STANDARD_MS             (100)   /* normal command/response */
#define USB_TIMEOUT_LONG_MS                 (2000)  /* patch name fetch, slow ops */

/* Patch format byte layout (USB bulk ↔ pch2 conversion) */
#define PCH2_USB_DATA_OFFSET                (0x03)  /* pch2 payload start in USB frame */
#define PCH2_USB_CHUNK1_END                 (0x15)  /* exclusive end of first pch2 chunk */
#define PCH2_USB_CHUNK2_START               (0x17)  /* start of second pch2 chunk */
#define PCH2_USB_TAIL_SIZE                  (0x02)  /* trailing CRC bytes in USB frame */

#endif /* __G2_DEFS_H__ */
