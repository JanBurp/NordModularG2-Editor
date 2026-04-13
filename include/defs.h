/*
 * G2 CLI - Protocol constants from G2-Edit defs.h
 *
 * Copyright (C) 2025 Chris Turner
 * Based on G2-Edit by Chris Turner
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

#ifndef __G2_DEFS_H__
#define __G2_DEFS_H__

/* Slot types */
typedef enum {
    SLOT_A = 0,
    SLOT_B = 1,
    SLOT_C = 2,
    SLOT_D = 3,
    SLOT_CURRENT = -1
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

/* USB Configuration */
#define VENDOR_ID                           (0x0ffc)
#define PRODUCT_ID                          (2)

/* USB Endpoints (from G2-Edit) */
#define ENDPOINT_BULK_OUT                   (0x03)  /* Bulk OUT */
#define ENDPOINT_INTERRUPT_IN               (0x81)  /* Interrupt IN */
#define ENDPOINT_BULK_IN                    (0x82)  /* Bulk IN */

#endif /* __G2_DEFS_H__ */
