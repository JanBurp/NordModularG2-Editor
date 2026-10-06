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
#define SUB_COMMAND_GET_PATCH_TEXT           (0x6e)  /* Patch notes ("Text Pad"); read-only — no live SET exists in the real protocol */
#define SUB_COMMAND_GET_MIDI_CC              (0x81)

/* Sub Commands - Actions */
#define SUB_COMMAND_SET_PARAM                (0x40)
#define SUB_COMMAND_SEL_PARAM                (0x2f)  /* Move hardware panel cursor to a param (CMParamFocusDump) */
#define SUB_COMMAND_SEL_PARAM_PAGE           (0x2d)  /* Select front-panel Parameter Page (CMParameterPageFocus); payload = page*3 + bank, 0-14 */
#define SUB_COMMAND_GET_PARAM_PAGE           (0x58)  /* Request current Parameter Page (CMParameterPageFocusRequest); reply is the 0x2D message */
#define SUB_COMMAND_GET_GLOBAL_PAGE          (0x59)  /* Request current Global Parameter Page (CMGlobalParameterPageFocusRequest); reply is 0x1E */
#define SUB_COMMAND_ASSIGN_KNOB              (0x25)  /* Parameter Pages knob assign (S_ASSIGN_KNOB) */
#define SUB_COMMAND_DEASSIGN_KNOB            (0x26)  /* Parameter Pages knob deassign (S_DEASSIGN_KNOB) */
#define SUB_COMMAND_SET_MORPH_RANGE          (0x43)  /* Morph group range assignment (S_SET_MORPH_RANGE) */
#define SUB_COMMAND_ASSIGN_GLOBAL_KNOB       (0x1c)  /* Global Parameter Pages sibling of 0x25 (S_ASS_GLOBAL_KNOB) */
#define SUB_COMMAND_DEASSIGN_GLOBAL_KNOB     (0x1d)  /* Global Parameter Pages sibling of 0x26 (S_DEASS_GLOB_KNOB) */
#define SUB_COMMAND_SEL_GLOBAL_PAGE          (0x1e)  /* Global Parameter Pages sibling of SUB_COMMAND_SEL_PARAM_PAGE (S_SEL_GLOBAL_PAGE) */
#define SUB_COMMAND_GET_GLOBAL_KNOBS         (0x5e)  /* Bulk fetch request (Q_GLOBAL_KNOBS); response chunk id is C_KNOBS_GLOBAL, 0x5f */
#define RESP_CHUNK_KNOBS_GLOBAL              (0x5f)  /* Response tag byte for the above (C_KNOBS_GLOBAL) */
#define SUB_COMMAND_SET                      (0x37)  /* Upload patch to slot */
#define SUB_COMMAND_CTRL_SNAPSHOT           (0x55)  /* Send controller snapshot (S_CTRL_SNAPSHOT) */
#define SUB_COMMAND_MIDI_DUMP                (0x3d)  /* MIDI SYSEX dump (S_MIDI_DUMP) */
#define SUB_COMMAND_PATCH_BANK_UPLOAD        (0x17)  /* Request bank upload from device (S_PATCH_BANK_UPLOAD) */
#define SUB_COMMAND_PATCH_BANK_DATA          (0x19)  /* Send bank data to device (S_PATCH_BANK_DATA) */
#define SUB_COMMAND_PLAY_NOTE                (0x56)  /* Virtual Keyboard note on/off, system-scope, no slot field.
                                                         Hardware-confirmed via other-approaches/G2-Edit (chrispurusha/G2-Edit)
                                                         and independently corroborated by a Ghidra decompile of Clavia's own
                                                         editor (CMPlayNote::WriteStream); see g2_play_note() for the payload
                                                         shape and the inverted on/off flag. */
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
#define SUB_RESPONSE_PATCH_NOTES              (0x6f)

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
#define USB_TIMEOUT_STANDARD_MS             (500)   /* normal command/response - was 100ms, too tight under LED/VU telemetry load */
#define USB_TIMEOUT_LONG_MS                 (2000)  /* patch name fetch, slow ops */
#define USB_TIMEOUT_SEND_MS                 (5000)  /* bulk-OUT write; a whole .prf2 is ~34 KB */

/* Largest message the G2 will accept on bulk OUT.
 * Empirical (2026-09-17): a 30,493-byte .prf2 (message ~30,440) writes fine, a
 * 34,065-byte one (~34,012) is rejected with a 0x7E code-3 parse NACK - the
 * device then reads the overflow as further molecules, renames the live slots
 * to "Error" and stops answering until a power cycle. The official Clavia
 * editor fails on the same file at the same bank location, so this is a
 * firmware limit, not ours. There is no constant to copy from the reference -
 * its transport caps a chunk at 0xffff (CBubblePort::GenerateMessages) - so
 * this is the conservative power-of-two boundary inside the observed window. */
#define G2_MAX_MESSAGE_LEN                  (32768)

/* Module indices run 1..127 per area (official editor: CPatchData::GetUniqueID, which also
 * borrows bit 7 as a temporary flag). Hardware-observed 2026-10-04: add-module with index 128
 * gets a 0x7E code-3 NACK, and a follow-up add/cable on that index wedges the G2 until a
 * power cycle. */
#define G2_MAX_MODULE_INDEX                 (127)

/* Fx-In is the only module the official editor allows in just one area (CBuildModule::IsValidContext
 * mask, read from the Mac v1.62 binary): FX only. Every other module type is valid in both areas. */
#define G2_MODULE_TYPE_FX_IN                (127)

/* A performance upload is answered by no ACK we can safely read (see send_perf_upload), so the
 * only way to avoid returning while the G2 is still applying its four slots is to wait. */
#define PERF_UPLOAD_SETTLE_US               (600000)

/* Patch format byte layout (USB bulk ↔ pch2 conversion) */
#define PCH2_USB_DATA_OFFSET                (0x03)  /* pch2 payload start in USB frame */
#define PCH2_USB_CHUNK1_END                 (0x15)  /* exclusive end of first pch2 chunk */
#define PCH2_USB_CHUNK2_START               (0x17)  /* start of second pch2 chunk */
#define PCH2_USB_TAIL_SIZE                  (0x02)  /* trailing CRC bytes in USB frame */
/* Text header of a .pch2/.prf2 as the official editor writes it (G2Editor.c builds the same four
 * lines; values are those of its newest files). A NUL, then 0x17 and the file type byte
 * (0x00 patch, 0x01 performance), then the sections follow it. */
#define G2_TEXT_HEADER(type) "Version=Nord Modular G2 File Format 1\r\nType=" type "\r\nVersion=23\r\nInfo=BUILD 320\r\n"
#define PCH2_TEXT_HEADER G2_TEXT_HEADER("Patch")
#define PRF2_TEXT_HEADER G2_TEXT_HEADER("Performance")

#endif /* __G2_DEFS_H__ */
