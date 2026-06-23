/*
 * G2 CLI - USB transport layer
 *
 * Low-level USB I/O via libusb: bulk send, bulk/interrupt receive, and
 * the background listener thread that owns EP 0x81/0x82. Also provides
 * packet-framing helpers (send_system, send_slot, etc.) used by g2_device.c.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <pthread.h>
#include <time.h>
#include <libusb.h>
#include "defs.h"
#include "g2_device.h"
#include "g2_io.h"
#include "g2_events.h"
#include "utils.h"

/* Global device state */
g2_device_t g2 = {
    .ctx = NULL,
    .handle = NULL,
    .interface_claimed = 0
};

int g2_debug = 0;
volatile int g2_pending_rearm = 0;

static int g2_last_claim_error = 0;
int g2_get_last_claim_error(void) { return g2_last_claim_error; }

static void debug_send(const char *fn, const uint8_t *buf, int len) {
    if (!g2_debug) return;
    printf("{\"debug\":\"send\",\"fn\":\"%s\",\"hex\":\"", fn);
    for (int i = 0; i < len; i++) printf("%02x", buf[i]);
    printf("\"}\n");
    fflush(stdout);
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

cJSON *g2_list_devices_json(void) {
    libusb_device **devices;
    ssize_t count = libusb_get_device_list(g2.ctx, &devices);
    cJSON *root = cJSON_CreateObject();
    cJSON *all = cJSON_CreateArray();
    cJSON *chosen = NULL;
    int g2_count = 0;

    if (count >= 0) {
        for (ssize_t i = 0; i < count; i++) {
            struct libusb_device_descriptor desc;
            if (libusb_get_device_descriptor(devices[i], &desc) != 0) continue;
            int isG2 = (desc.idVendor == VENDOR_ID && desc.idProduct == PRODUCT_ID);
            cJSON *entry = cJSON_CreateObject();
            char vid[5], pid[5];
            snprintf(vid, sizeof(vid), "%04x", desc.idVendor);
            snprintf(pid, sizeof(pid), "%04x", desc.idProduct);
            cJSON_AddStringToObject(entry, "vid", vid);
            cJSON_AddStringToObject(entry, "pid", pid);
            cJSON_AddNumberToObject(entry, "bus", libusb_get_bus_number(devices[i]));
            cJSON_AddNumberToObject(entry, "device", libusb_get_device_address(devices[i]));
            cJSON_AddBoolToObject(entry, "isG2", isG2);
            cJSON_AddItemToArray(all, entry);
            if (isG2) {
                g2_count++;
                if (!chosen) chosen = entry;
            }
        }
        libusb_free_device_list(devices, 1);
    }

    cJSON_AddItemToObject(root, "all", all);
    cJSON_AddNumberToObject(root, "g2_count", g2_count);
    if (chosen) {
        cJSON *c = cJSON_CreateObject();
        cJSON_AddStringToObject(c, "vid", cJSON_GetStringValue(cJSON_GetObjectItem(chosen, "vid")));
        cJSON_AddStringToObject(c, "pid", cJSON_GetStringValue(cJSON_GetObjectItem(chosen, "pid")));
        cJSON_AddNumberToObject(c, "bus", cJSON_GetObjectItem(chosen, "bus")->valuedouble);
        cJSON_AddNumberToObject(c, "device", cJSON_GetObjectItem(chosen, "device")->valuedouble);
        cJSON_AddItemToObject(root, "chosen", c);
    } else {
        cJSON_AddNullToObject(root, "chosen");
    }
    return root;
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
        g2_last_claim_error = ret;
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
    if (ret >= 0) debug_send("sys", buff, msgLength);
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
    if (ret >= 0) debug_send("sys_data", buff, msgLength);
    return (ret < 0) ? -1 : 0;
}

/* Build and send a slot-scoped G2 command.
 * version must match the current patch version for that slot — the G2 ignores
 * commands with a stale version byte (use g2_slot_version[] from g2_device.h). */
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
    if (ret >= 0) debug_send("slot", buff, msgLength);
    return (ret < 0) ? -1 : 0;
}

/* Build and send a slot-scoped compound G2 command containing multiple sub-operations.
 * Each G2Op contributes one [cmd][payload...] segment; they are concatenated in the
 * frame in order, matching the Delphi editor's TG2SendMessage batching approach. */
int send_slot_batch(uint8_t slot, uint8_t version, const G2Op *ops, int n_ops) {
    uint8_t buff[4096] = {0};
    int pos = COMMAND_OFFSET;

    buff[pos++] = 0x01;
    buff[pos++] = COMMAND_REQ | COMMAND_SLOT | slot;
    buff[pos++] = version;

    for (int i = 0; i < n_ops; i++) {
        if (pos + 1 + ops[i].len > (int)sizeof(buff) - 2) break;
        buff[pos++] = ops[i].cmd;
        memcpy(buff + pos, ops[i].payload, (size_t)ops[i].len);
        pos += ops[i].len;
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
    if (ret >= 0) debug_send("slot_batch", buff, msgLength);
    return (ret < 0) ? -1 : 0;
}

/* ── Listener thread infrastructure ────────────────────────────────────── */
/* Thread-safe FIFO: the listener thread pushes messages; the daemon main loop
 * and the recv_interrupt/recv_bulk shims pop them. */

volatile int g2_listener_active = 0;

/* Pending bulk buffer: set by recv_interrupt shim when pulling extended msg from queue,
 * consumed by recv_bulk shim. */
static uint8_t  *pending_bulk      = NULL;
static uint16_t  pending_bulk_size = 0;

#define MSG_QUEUE_MAX 64

typedef struct msg_node {
    g2_msg_t        msg;
    struct msg_node *next;
} msg_node_t;

static struct {
    msg_node_t     *head;
    msg_node_t     *tail;
    int             count;
    pthread_mutex_t mutex;
    pthread_cond_t  cond;
} mq = {
    .head  = NULL,
    .tail  = NULL,
    .count = 0,
    .mutex = PTHREAD_MUTEX_INITIALIZER,
    .cond  = PTHREAD_COND_INITIALIZER,
};

static void mq_push_locked(g2_msg_t msg) {
    if (mq.count >= MSG_QUEUE_MAX) {
        /* Drop oldest message — LED/vol dominates, losing one state update is fine. */
        msg_node_t *old = mq.head;
        mq.head = old->next;
        if (!mq.head) mq.tail = NULL;
        mq.count--;
        if (old->msg.bulk) free(old->msg.bulk);
        free(old);
    }
    msg_node_t *n = malloc(sizeof(*n));
    if (!n) { if (msg.bulk) free(msg.bulk); return; }
    n->msg  = msg;
    n->next = NULL;
    if (mq.tail) mq.tail->next = n;
    else         mq.head       = n;
    mq.tail = n;
    mq.count++;
    pthread_cond_signal(&mq.cond);
}

static void mq_push(g2_msg_t msg) {
    pthread_mutex_lock(&mq.mutex);
    mq_push_locked(msg);
    pthread_mutex_unlock(&mq.mutex);
}

int g2_msg_recv(g2_msg_t *out, int timeout_ms) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    ts.tv_sec  += timeout_ms / 1000;
    ts.tv_nsec += (long)(timeout_ms % 1000) * 1000000L;
    if (ts.tv_nsec >= 1000000000L) { ts.tv_sec++; ts.tv_nsec -= 1000000000L; }

    pthread_mutex_lock(&mq.mutex);
    while (!mq.head) {
        if (pthread_cond_timedwait(&mq.cond, &mq.mutex, &ts) == ETIMEDOUT) {
            pthread_mutex_unlock(&mq.mutex);
            return -1;
        }
    }
    msg_node_t *n = mq.head;
    mq.head = n->next;
    if (!mq.head) mq.tail = NULL;
    mq.count--;
    *out = n->msg;
    free(n);
    pthread_mutex_unlock(&mq.mutex);
    return 0;
}

void g2_msg_free(g2_msg_t *msg) {
    if (msg && msg->bulk) {
        free(msg->bulk);
        msg->bulk = NULL;
    }
}

/* Direct bulk read used only by the listener thread — bypasses recv_bulk shim. */
static int listener_recv_bulk(uint8_t *data, uint16_t size) {
    int transferred, ret, received = 0, retries = 5;
    while (retries > 0 && received < size) {
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN,
                                   data + received, size - received,
                                   &transferred, USB_TIMEOUT_STANDARD_MS);
        if (ret == 0 && transferred > 0) received += transferred;
        else retries--;
    }
    return received;
}

static volatile int listener_running = 0;
static pthread_t    listener_tid;

static void *listener_thread(void *arg) {
    (void)arg;
    uint8_t hdr[16];

    while (listener_running) {
        int ret = recv_interrupt_with_retry(hdr, sizeof(hdr), 200, 1);
        if (ret == LIBUSB_ERROR_NO_DEVICE) {
            g2_msg_t m = {0};
            m.sentinel = 1;
            mq_push(m);
            break;
        }
        if (ret <= 0) continue;

        g2_msg_t msg = {0};
        memcpy(msg.interrupt, hdr, sizeof(hdr));

        uint8_t msgType = hdr[0] & 0x0f;
        if (msgType == RESPONSE_TYPE_EXTENDED) {
            uint16_t size = ((uint16_t)hdr[1] << 8) | hdr[2];
            if (size > 0) {
                msg.bulk = malloc(size);
                if (msg.bulk) {
                    msg.bulk_size = (uint16_t)listener_recv_bulk(msg.bulk, size);
                    /* BULK_REARM: all-slots version update — G2 stops streaming after this.
                     * Signal daemon via sentinel=2 so recv_interrupt() skips it, but keep
                     * the bulk payload so emit_bulk_event() can process the full message. */
                    if (msg.bulk_size > 3 &&
                        msg.bulk[1] == 0x04 && msg.bulk[2] == 0x40 && msg.bulk[3] == 0x1f) {
                        memset(g2_slot_version, 0, sizeof(g2_slot_version));
                        msg.sentinel = 2;
                        mq_push(msg);
                        continue;
                    }
                }
            }
        } else if (msgType == RESPONSE_TYPE_EMBEDDED) {
            /* Update slot version cache for patch_version notifications. */
            if (hdr[3] == 0x40 && (hdr[4] == 0x36 || hdr[4] == 0x38)) {
                uint8_t slot = hdr[5];
                uint8_t ver  = hdr[6];
                if (slot < 4) g2_slot_version[slot] = ver;
            }
        }

        mq_push(msg);
    }
    return NULL;
}

int g2_listener_start(void) {
    if (listener_running) return 0;
    listener_running = 1;
    g2_listener_active = 1;
    int ret = pthread_create(&listener_tid, NULL, listener_thread, NULL);
    if (ret != 0) {
        listener_running = 0;
        g2_listener_active = 0;
        return -1;
    }
    return 0;
}

void g2_listener_stop(void) {
    if (!listener_running) return;
    listener_running = 0;
    g2_listener_active = 0;
    pthread_join(listener_tid, NULL);

    /* Drain any messages left in the queue. */
    pthread_mutex_lock(&mq.mutex);
    msg_node_t *n = mq.head;
    while (n) {
        msg_node_t *next = n->next;
        if (n->msg.bulk) free(n->msg.bulk);
        free(n);
        n = next;
    }
    mq.head = mq.tail = NULL;
    mq.count = 0;
    pthread_mutex_unlock(&mq.mutex);

    /* Discard any pending bulk from the shim. */
    if (pending_bulk) { free(pending_bulk); pending_bulk = NULL; }
    pending_bulk_size = 0;
}

/* ── Low-level USB receive helpers ─────────────────────────────────────── */

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

/* When listener active: pull from queue, skip LED/vol extended msgs.
 * Extended msgs store their bulk in pending_bulk for a subsequent recv_bulk() call.
 * When listener inactive: direct libusb call (original behaviour). */
int recv_interrupt(uint8_t *response, int size, int timeout_ms) {
    if (!g2_listener_active)
        return recv_interrupt_with_retry(response, size, timeout_ms, 1);

    struct timespec deadline, now;
    clock_gettime(CLOCK_REALTIME, &deadline);
    deadline.tv_sec  += timeout_ms / 1000;
    deadline.tv_nsec += (long)(timeout_ms % 1000) * 1000000L;
    if (deadline.tv_nsec >= 1000000000L) {
        deadline.tv_sec++;
        deadline.tv_nsec -= 1000000000L;
    }

    g2_msg_t msg;
    for (;;) {
        clock_gettime(CLOCK_REALTIME, &now);
        long rem = (deadline.tv_sec - now.tv_sec) * 1000L
                 + (deadline.tv_nsec - now.tv_nsec) / 1000000L;
        if (rem <= 0) break;
        int wait = (int)(rem > 50 ? 50 : rem);
        if (g2_msg_recv(&msg, wait) != 0) continue;

        if (msg.sentinel == 1) {
            g2_msg_free(&msg);
            return LIBUSB_ERROR_NO_DEVICE;
        }
        if (msg.sentinel == 2) {
            /* BULK_REARM arrived while a command handler owns recv_interrupt().
             * Record it so the daemon main loop can call g2_rearm() after the
             * command returns — we cannot call g2_rearm() here because we are
             * still inside the command handler's call stack. */
            g2_pending_rearm = 1;
            g2_msg_free(&msg);
            continue;
        }
        /* Skip LED (0x39) and volume (0x3A) extended messages. */
        if (msg.bulk && msg.bulk_size > 3) {
            uint8_t sub = msg.bulk[3];
            if (sub == 0x39 || sub == 0x3A) {
                g2_msg_free(&msg);
                continue;
            }
        }
        /* Skip generic ok/error acks (aCmd 0x04/0x0C, subCmd 0x7F/0x7E) for
         * embedded messages — these are async confirmations of an earlier
         * fire-and-forget command (e.g. set-slot-key) meant for the main
         * loop's event drain (see g2_events.c emit_embedded_event), not for
         * whichever command currently owns this recv_interrupt() call. A
         * caller actually waiting on its own embedded response expects a
         * different aCmd/subCmd, so this can't be mistaken for real data. */
        if ((msg.interrupt[0] & 0x0f) == RESPONSE_TYPE_EMBEDDED) {
            uint8_t aCmd = msg.interrupt[2];
            uint8_t subCmd = msg.interrupt[4];
            if ((aCmd == 0x04 || aCmd == 0x0C) && (subCmd == 0x7F || subCmd == 0x7E)) {
                g2_msg_free(&msg);
                continue;
            }
            /* Unsolicited push notifications (slot_change, assigned_voices, perf_name,
             * clock, midi_cc, patch_version_change) can arrive interleaved with a query's
             * real response — e.g. assigned_voices fires right after a perf load triggers
             * voice reassignment, racing with query_perf_settings()'s own request/response.
             * Relay them via the normal event dispatcher so they aren't lost, but never hand
             * them back here as if they might be the response a caller is waiting for. */
            if (aCmd == 0x04 && (subCmd == 0x09 || subCmd == 0x05 || subCmd == 0x29 ||
                                  subCmd == 0x3F || subCmd == 0x5D || subCmd == 0x80 || subCmd == 0x38)) {
                g2_emit_event(&msg);
                g2_msg_free(&msg);
                continue;
            }
        }
        /* Return this message. */
        int copy = (size > 16) ? 16 : size;
        memcpy(response, msg.interrupt, (size_t)copy);
        if (msg.bulk) {
            free(pending_bulk);
            pending_bulk      = msg.bulk;
            pending_bulk_size = msg.bulk_size;
            msg.bulk          = NULL;   /* ownership transferred to pending_bulk */
        }
        g2_msg_free(&msg);
        return copy;
    }
    return 0;   /* timeout */
}

/* When listener active: return bulk that recv_interrupt() saved in pending_bulk.
 * When listener inactive: direct libusb loop (original behaviour). */
int recv_bulk(uint8_t *data, uint16_t size) {
    if (g2_listener_active) {
        if (!pending_bulk || pending_bulk_size == 0) return 0;
        uint16_t n = (pending_bulk_size < size) ? pending_bulk_size : size;
        memcpy(data, pending_bulk, n);
        free(pending_bulk);
        pending_bulk      = NULL;
        pending_bulk_size = 0;
        return n;
    }

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
    if (ret >= 0) debug_send("init", buff, msgLen);
    return (ret < 0) ? -1 : 0;
}

/* Send START_COMM to re-arm G2 streaming.
 * When listener is active the ACK arrives via the listener queue — caller must
 * drain one message from g2_msg_recv() if it needs to wait for the ACK. */
void g2_rearm(void) {
    uint8_t arm[2] = {SUB_COMMAND_START_STOP, 0x00};
    send_system_data(0x41, arm, 2);
    if (!g2_listener_active) {
        uint8_t arm_ack[16];
        recv_interrupt(arm_ack, sizeof(arm_ack), USB_TIMEOUT_STANDARD_MS);
    }
}

void g2_stop_comm(void) {
    uint8_t stop[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop, 2);
    uint8_t buf[16];
    for (int tries = 0; tries < 20; tries++) {
        int ret = recv_interrupt(buf, sizeof(buf), USB_TIMEOUT_STANDARD_MS);
        if (ret <= 0) break;
        if ((buf[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)buf[1] << 8) | buf[2];
            if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
        } else {
            break;  /* EMBEDDED — STOP_COMM ACK */
        }
    }
}

/* Check if bulk payload is the all-slots version update that stops the stream */
static int bulk_needs_rearm(const uint8_t *bulk, int size) {
    return size > 3 && bulk[1] == 0x04 && bulk[2] == 0x40 && bulk[3] == 0x1F;
}

/* No-op when listener is active (listener drains EP 0x81 continuously).
 * When inactive: drain all pending interrupt+bulk messages. */
int g2_drain_pending(void) {
    if (g2_listener_active) return 0;

    uint8_t response[16];
    int ret, count = 0, needs_rearm = 0;
    while ((ret = recv_interrupt(response, sizeof(response), USB_TIMEOUT_DRAIN_MS)) > 0) {
        count++;
        if ((response[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t size = ((uint16_t)response[1] << 8) | response[2];
            if (size > 0) {
                uint8_t *bulk = malloc(size);
                if (bulk) {
                    int bret = recv_bulk(bulk, size);
                    if (bulk_needs_rearm(bulk, bret)) needs_rearm = 1;
                    free(bulk);
                }
            }
        }
    }
    if (needs_rearm) g2_rearm();
    (void)count;
    return count;
}
