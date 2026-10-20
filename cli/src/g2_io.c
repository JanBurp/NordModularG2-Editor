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

#ifdef _WIN32   /* MinGW has no POSIX flockfile; MSVCRT equivalents */
#define flockfile   _lock_file
#define funlockfile _unlock_file
#endif

/* Global device state */
g2_device_t g2 = {
    .ctx = NULL,
    .handle = NULL,
    .interface_claimed = 0
};

int g2_target_bus = 0;
int g2_target_device = 0;
int g2_target_last_seen = 0;

void g2_set_target(int bus, int device) {
    g2_target_bus = bus;
    g2_target_device = device;
}

static int is_g2_device(const struct libusb_device_descriptor *desc) {
    return desc->idVendor == VENDOR_ID && desc->idProduct == PRODUCT_ID;
}

/* Resolves the `index`-th attached G2 unit (0-based, same enumeration order
 * as g2_list_devices_json()'s "all" array) to its bus/device pair and calls
 * g2_set_target() with it. Returns 0 on success, -1 if fewer than index+1
 * G2 units are currently attached.
 *
 * This enumeration pass is deliberately independent of g2_open_target()'s own
 * later pass rather than opening the device here and handing off a cached
 * handle: the only caller of this function (--device <n>, see main.c) turns
 * around and calls g2_connect()/g2_connect_silent() immediately after with no
 * I/O in between, so that gap is negligible. The path that actually matters
 * for multi-device replug risk is `daemon <bus> <device>` (bus/device passed
 * in directly from a separate, earlier process — see main.c) and every
 * reconnect for the life of that daemon — an inherently cross-process/
 * long-lived race no amount of restructuring here can close. See g2_io.h. */
int g2_set_target_by_index(int index) {
    libusb_device **devices;
    ssize_t count = libusb_get_device_list(g2.ctx, &devices);
    if (count < 0) return -1;

    int seen = 0, bus = 0, device = 0, ok = 0;
    for (ssize_t i = 0; i < count; i++) {
        struct libusb_device_descriptor desc;
        if (libusb_get_device_descriptor(devices[i], &desc) != 0) continue;
        if (!is_g2_device(&desc)) continue;
        if (seen == index) {
            bus = libusb_get_bus_number(devices[i]);
            device = libusb_get_device_address(devices[i]);
            ok = 1;
            break;
        }
        seen++;
    }
    libusb_free_device_list(devices, 1);
    if (!ok) return -1;

    g2_set_target(bus, device);
    return 0;
}

int g2_debug = 0;
volatile int g2_pending_rearm = 0;
volatile int g2_pending_disconnect = 0;
volatile unsigned long g2_msg_drops = 0;
volatile int g2_stream_locked = 0;

static int g2_last_claim_error = 0;
int g2_get_last_claim_error(void) { return g2_last_claim_error; }

/* Frame trace: ring of the most recent frames in both directions (LED/volume
 * stream excluded), dumped on disconnect so a wedge can be correlated with what
 * went over the wire just before it. Written by the main thread (sends) and the
 * listener thread (receives), hence the mutex. */
#define G2_TRACE_N     64
#define G2_TRACE_BYTES 24
typedef struct { long long ms; char dir; int len; uint8_t b[G2_TRACE_BYTES]; } g2_trace_ent;
static g2_trace_ent    g2_trace_ring[G2_TRACE_N];
static unsigned        g2_trace_count;
static pthread_mutex_t g2_trace_mu = PTHREAD_MUTEX_INITIALIZER;

static long long trace_now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

void g2_trace(char dir, const uint8_t *buf, int len) {
    pthread_mutex_lock(&g2_trace_mu);
    g2_trace_ent *e = &g2_trace_ring[g2_trace_count++ % G2_TRACE_N];
    e->ms = trace_now_ms();
    e->dir = dir;
    e->len = len;
    memcpy(e->b, buf, (size_t)(len < G2_TRACE_BYTES ? len : G2_TRACE_BYTES));
    pthread_mutex_unlock(&g2_trace_mu);
}

void g2_trace_dump(void) {
    long long now = trace_now_ms();
    pthread_mutex_lock(&g2_trace_mu);
    unsigned total = g2_trace_count < G2_TRACE_N ? g2_trace_count : G2_TRACE_N;
    fprintf(stderr, "[trace] last %u frames (> sent, < received), oldest first:\n", total);
    for (unsigned i = g2_trace_count - total; i < g2_trace_count; i++) {
        const g2_trace_ent *e = &g2_trace_ring[i % G2_TRACE_N];
        int n = e->len < G2_TRACE_BYTES ? e->len : G2_TRACE_BYTES;
        fprintf(stderr, "[trace] -%5lld ms %c len=%-5d ", now - e->ms, e->dir, e->len);
        for (int j = 0; j < n; j++) fprintf(stderr, "%02x", e->b[j]);
        fprintf(stderr, "%s\n", e->len > n ? "..." : "");
    }
    pthread_mutex_unlock(&g2_trace_mu);
}

static void debug_hex(const char *dir, const char *fn, const uint8_t *buf, int len) {
    if (!g2_debug) return;
    flockfile(stdout);   /* keep the line whole against the other thread's own stdout JSON */
    printf("{\"debug\":\"%s\",\"fn\":\"%s\",\"hex\":\"", dir, fn);
    for (int i = 0; i < len; i++) printf("%02x", buf[i]);
    printf("\"}\n");
    fflush(stdout);
    funlockfile(stdout);
}

static void debug_send(const char *fn, const uint8_t *buf, int len) {
    g2_trace('>', buf, len);
    debug_hex("send", fn, buf, len);
}

/* Mirrors debug_send but for the listener thread's raw interrupt reads — every 16-byte header
 * it sees, unconditionally, before any msgType classification. g2_emit_event() only knows how
 * to route RESPONSE_TYPE_EXTENDED/EMBEDDED; this catches anything upstream of that, including a
 * message the listener itself drops without ever queuing it. */
static void debug_recv(const uint8_t *hdr) {
    debug_hex("recv", "listener", hdr, 16);
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
    int g2_idx = 0;
    for (ssize_t i = 0; i < count; i++) {
        libusb_device *dev = devices[i];
        struct libusb_device_descriptor desc;

        int ret = libusb_get_device_descriptor(dev, &desc);
        if (ret == 0) {
            printf("  %04x:%04x (bus %d, device %d)",
                   desc.idVendor, desc.idProduct,
                   libusb_get_bus_number(dev),
                   libusb_get_device_address(dev));
            /* Index matches g2_set_target_by_index() (--device <n>). */
            if (is_g2_device(&desc))
                printf(" <- Nord G2 --device %d", g2_idx++);
            printf("\n");
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
            int isG2 = is_g2_device(&desc);
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

/* Opens the G2 handle, honoring g2_target_bus/g2_target_device when set (both
 * nonzero); falls back to the original "first G2 found" behavior otherwise, so
 * every existing single-device caller is unaffected. When targeting a specific
 * bus/address, libusb_open() takes its own reference on the device, so freeing
 * the list right after (unref_devices=1) is safe — same pattern
 * libusb_open_device_with_vid_pid() itself uses internally. */
static libusb_device_handle *g2_open_target(void) {
    if (g2_target_bus == 0 && g2_target_device == 0) {
        return libusb_open_device_with_vid_pid(g2.ctx, VENDOR_ID, PRODUCT_ID);
    }

    /* This enumeration pass is independent of g2_set_target_by_index()'s (if
     * that was how the target was chosen) — unavoidable given libusb has no
     * "resolve and open atomically" call, and not worth adding a consume-once
     * cached-handle handoff for: the TOCTOU window this could theoretically
     * close is negligible for the one caller with no I/O in between
     * (--device <n>, see main.c); every other caller (a daemon's initial
     * connect and every later reconnect, see daemon.c) re-opens by bus/device
     * repeatedly for the life of the process regardless, so the race is
     * inherent there and not something a single merged pass would fix. See
     * g2_io.h for the chosen mitigation (g2_target_last_seen below). */
    libusb_device **devices;
    ssize_t count = libusb_get_device_list(g2.ctx, &devices);
    if (count < 0) return NULL;

    libusb_device_handle *handle = NULL;
    g2_target_last_seen = 0;
    for (ssize_t idx = 0; idx < count; idx++) {
        struct libusb_device_descriptor desc;
        if (libusb_get_device_descriptor(devices[idx], &desc) != 0) continue;
        if (!is_g2_device(&desc)) continue;
        if (libusb_get_bus_number(devices[idx]) != g2_target_bus) continue;
        if (libusb_get_device_address(devices[idx]) != g2_target_device) continue;
        g2_target_last_seen = 1;
        if (libusb_open(devices[idx], &handle) != 0) handle = NULL;
        break;
    }

    libusb_free_device_list(devices, 1);
    return handle;
}

int g2_connect(void) {
    int ret;

    g2.handle = g2_open_target();
    if (!g2.handle) {
        if (g2_target_bus || g2_target_device) {
            fprintf(stderr, "G2 not found at bus %d device %d (%s)\n",
                    g2_target_bus, g2_target_device,
                    g2_target_last_seen ? "was seen during enumeration, open failed - likely unplugged mid-connect"
                                         : "not present in the last enumeration");
            return G2_ERR_TARGET_NOT_FOUND;
        }
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

    g2.handle = g2_open_target();
    if (!g2.handle) {
        return (g2_target_bus || g2_target_device) ? G2_ERR_TARGET_NOT_FOUND : G2_ERR_NOT_FOUND;
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
    /* A one-shot CLI command that locked the stream (set-perf-mode) has no other cleanup point before the process exits -
     * without this, the G2 is left not reporting LED/VU/param notifications
     * until something else sends START_COMM (e.g. the daemon's own startup
     * lock/unlock cycle). do_reconnect() already zeroes g2_stream_locked
     * before calling this, so this is a no-op on that path. */
    if (g2_stream_locked && g2.handle) g2_unlock_stream();
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

    /* pos + extraLen + 2 (header bytes already counted in pos) + 2 (CRC) must fit */
    if (pos + 3 + extraLen + 2 > sizeof(buff)) return -1;

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
    else fprintf(stderr, "send_system_data: write failed: %s\n", libusb_error_name(ret));
    return (ret < 0) ? -1 : 0;
}

/* Build and send a slot-scoped G2 command.
 * version must match the current patch version for that slot — the G2 ignores
 * commands with a stale version byte (use g2_slot_version[] from g2_device.h). */
int send_slot(uint8_t slot, uint8_t version, uint8_t subcmd,
              const uint8_t *extra, size_t extraLen) {
    uint8_t buff[2048] = {0};
    int pos = COMMAND_OFFSET;

    /* 4 header bytes written below + extraLen payload + 2 CRC must fit */
    if (pos + 4 + extraLen + 2 > sizeof(buff)) return -1;

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
    else fprintf(stderr, "send_slot: write failed: %s\n", libusb_error_name(ret));
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
        if (pos + 1 + ops[i].len > (int)sizeof(buff) - 2) {
            fprintf(stderr, "send_slot_batch: batch too large for one frame (%d ops)\n", n_ops);
            return -1;  /* fail atomically rather than silently dropping ops */
        }
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
    else fprintf(stderr, "send_slot_batch: write failed: %s\n", libusb_error_name(ret));
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
        /* Drop oldest message — LED/vol dominates, losing one state update is fine.
         * Counted, because when it is NOT an LED update that gets evicted the
         * result is a command waiting forever for a reply that was silently
         * thrown away - the "no reply from device for location N" a bank write
         * aborts with. g2_send_bank reports any drops over its run. */
        g2_msg_drops++;
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
    int transferred = 0, ret, received = 0, retries = 5;
    while (retries > 0 && received < size) {
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN,
                                   data + received, size - received,
                                   &transferred, USB_TIMEOUT_STANDARD_MS);
        received += transferred;   /* bytes that arrived with a timeout are consumed too */
        if (ret != 0 || transferred == 0) retries--;
    }
    debug_hex("recv", "listener_bulk", data, received);
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

        debug_recv(hdr);

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
                        memset(g2_slot_version_zero, 0, sizeof(g2_slot_version_zero));
                        msg.sentinel = 2;
                        mq_push(msg);
                        continue;
                    }
                } else {
                    /* Out of memory: still consume the bulk so it isn't taken as
                     * the next read. */
                    uint8_t scratch[512];
                    for (int left = size; left > 0; ) {
                        int n = listener_recv_bulk(scratch, (uint16_t)(left > 512 ? 512 : left));
                        if (n <= 0) break;
                        left -= n;
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

        if (!(msg.bulk && msg.bulk_size > 3 && (msg.bulk[3] == 0x39 || msg.bulk[3] == 0x3A)))
            g2_trace('<', msg.bulk ? msg.bulk : msg.interrupt, msg.bulk ? msg.bulk_size : 16);
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
    /* One message per read. Every interrupt message is a full 16-byte packet (the
     * endpoint's max packet size), so a larger request never ends on a short packet:
     * it swallows the following headers too, and their bulk payloads are then never
     * read - the same orphaned-payload wedge as below. */
    if (size > 16) size = 16;
    for (int i = 0; i < retries; i++) {
        /* Use bulk_transfer even on the interrupt endpoint: g2_recv_response does
         * the same and libusb_interrupt_transfer on macOS can ignore timeouts
         * after many rapid transfers, causing the watch loop to hang. */
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_INTERRUPT_IN, response, size, &transferred, timeout_ms);
        /* A header that lands right at the timeout comes back as LIBUSB_ERROR_TIMEOUT
         * with transferred == 16: the G2 has sent it, so it must be used. Dropping it
         * leaves its bulk payload unread on EP 0x82, every later bulk read is one
         * message behind, and the G2 stops answering until a power cycle.
         * Hardware-confirmed: the listener hits this several times per test run. */
        if (transferred > 0 && (ret == 0 || ret == LIBUSB_ERROR_TIMEOUT)) {
            return transferred;
        }
        if (ret == LIBUSB_ERROR_NO_DEVICE) return LIBUSB_ERROR_NO_DEVICE;
        usleep(USB_SEND_DELAY_US);
    }
    return -1;
}

/* When listener active: pull from queue, skip LED/vol extended msgs.
 * Extended msgs store their bulk in pending_bulk for a subsequent recv_bulk() call.
 * When listener inactive: direct libusb call (original behaviour).
 * keep_acks: hand generic ok/error acks back too, for a caller that waits for its own write's ack. */
static int recv_interrupt_filtered(uint8_t *response, int size, int timeout_ms, int keep_acks) {
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
            g2_pending_disconnect = 1;
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
            if (!keep_acks && (aCmd == 0x04 || aCmd == 0x0C) && (subCmd == 0x7F || subCmd == 0x7E)) {
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
            /* Same rationale, for per-slot live watch-stream notifications (aCmd
             * 0-3: param_change, patch_param, morph_change, patch_version, ...).
             * These are spontaneous — no blocking command ever expects one of
             * these as its own reply — but they can arrive interleaved with e.g.
             * cable_get_version()'s GET_PATCH_VERSION query while a MIDI-CC
             * feedback loop is actively changing other params. Without this, such
             * a query can swallow a live param_change and misread an unrelated
             * data byte (e.g. a module ID) as the version, corrupting
             * g2_slot_version[] with a bogus value that then gets stamped on
             * every subsequent set-param — which the G2 silently rejects.
             * keep_acks: a 0x7F/0x7E here may be the NACK an edit waits for (its slot tag can't be trusted). */
            if (aCmd <= 0x03 && !(keep_acks && (subCmd == 0x7F || subCmd == 0x7E))) {
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

int recv_interrupt(uint8_t *response, int size, int timeout_ms) {
    return recv_interrupt_filtered(response, size, timeout_ms, 0);
}

int recv_interrupt_acks(uint8_t *response, int size, int timeout_ms) {
    return recv_interrupt_filtered(response, size, timeout_ms, 1);
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

    int transferred = 0;
    int ret;
    int retries = 5;
    int received = 0;
    while (retries > 0 && received < size) {
        ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_IN, data + received, size - received, &transferred, USB_TIMEOUT_STANDARD_MS);
        received += transferred;   /* bytes that arrived with a timeout are consumed too */
        if (ret != 0 || transferred == 0) retries--;
    }
    return received;
}

/* Send one bulk-OUT message, resuming after a short write - the write-side
 * mirror of recv_bulk's loop above.
 * The G2 reads a message as a single byte stream prefixed with its own length,
 * so a partial write has to be completed from where it stopped: re-sending the
 * whole frame (as the callers used to do on a failed transfer) leaves the device
 * mid-message and it parses the leftover bytes as further molecules, answering
 * with a 0x7E code-3 NACK and never sending the marker the caller waits for.
 * Confirmed on hardware: performance bank location 16, a 34 KB .prf2.
 * A whole .prf2 goes out in one frame, which at the G2's real full-speed
 * throughput needs far more than USB_TIMEOUT_STANDARD_MS - the reference editor
 * uses 5000 ms (CUSBManager::TxData -> WritePipeTO).
 * Retrying is only safe while nothing has gone out yet, which is exactly what
 * the stall counter allows.
 * Returns bytes sent, or -1 if the write makes no progress. */
int send_bulk_msg(const uint8_t *buff, int len) {
    /* Refuse before anything reaches the wire: a message the G2 cannot buffer
     * leaves it parsing the overflow as further molecules, which renames the
     * live slots to "Error" and wedges it until a power cycle. Callers turn
     * this into a skipped entry rather than a corrupted device. */
    if (len > G2_MAX_MESSAGE_LEN) return G2_ERR_TOO_LARGE;

    debug_send("bulk_msg", buff, len);

    int sent = 0, stalls = 0;
    while (sent < len) {
        int transferred = 0;
        int ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT,
                                       (uint8_t *)buff + sent, len - sent,
                                       &transferred, USB_TIMEOUT_SEND_MS);
        if (ret == LIBUSB_ERROR_PIPE) {
            /* Endpoint halted - clear it and retry this chunk, the same
             * recovery g2_send_command and the send_slot* helpers do. Leaving
             * a halt in place fails every later transfer on the endpoint, which
             * looks like "no USB connection" in the editor while the G2 itself
             * is perfectly fine. */
            libusb_clear_halt(g2.handle, ENDPOINT_BULK_OUT);
            ret = libusb_bulk_transfer(g2.handle, ENDPOINT_BULK_OUT,
                                       (uint8_t *)buff + sent, len - sent,
                                       &transferred, USB_TIMEOUT_SEND_MS);
        }
        sent += transferred;
        if (ret < 0 && ret != LIBUSB_ERROR_TIMEOUT) {
            fprintf(stderr, "send_bulk_msg: write failed at %d/%d: %s\n",
                    sent, len, libusb_error_name(ret));
            return -1;
        }
        if (transferred > 0) stalls = 0;
        else if (++stalls >= 3) {
            fprintf(stderr, "send_bulk_msg: no progress at %d/%d\n", sent, len);
            return -1;
        }
    }
    return sent;
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
        /* START_COMM has no ack of its own (see g2_stop_comm), so this is whatever arrives next - e.g. a one-shot
         * set-perf-mode's late 0x0C/0x1F reply. Its bulk must be read too: an orphaned payload wedges the G2. */
        if (recv_interrupt(arm_ack, sizeof(arm_ack), USB_TIMEOUT_STANDARD_MS) > 0 && (arm_ack[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)arm_ack[1] << 8) | arm_ack[2];
            if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
        }
    }
}

/* SUB_COMMAND_START_STOP (0x7d) has no protocol ack — confirmed against the
 * reference editor's CMSynthUnlockEditorSync, which has no ReadStream/
 * UseOnSynth anywhere: it's fire-and-forget. So there is no "the STOP_COMM
 * ack" message to identify; this just drains whatever was already in flight
 * (same short-timeout-until-quiet idiom as drain_stale_extended() in
 * g2_device.c) until nothing more arrives, bounded defensively against a
 * runaway stream. */
void g2_stop_comm(void) {
    uint8_t stop[2] = {SUB_COMMAND_START_STOP, STOP_COMM};
    send_system_data(0x41, stop, 2);
    uint8_t buf[16];
    for (int tries = 0; tries < 200; tries++) {
        int ret = recv_interrupt(buf, sizeof(buf), USB_TIMEOUT_STALE_MS);
        if (ret <= 0) break;
        if ((buf[0] & 0x0f) == RESPONSE_TYPE_EXTENDED) {
            uint16_t sz = ((uint16_t)buf[1] << 8) | buf[2];
            if (sz) { uint8_t *b = malloc(sz); if (b) { recv_bulk(b, sz); free(b); } }
        }
    }
}

/* Idempotent lock/unlock over g2_stop_comm()/g2_rearm(), tracked by
 * g2_stream_locked — see g2_io.h. Lets any number of callers stop/restart
 * the stream around a burst of operations while only the first lock and the
 * last unlock actually touch the wire. */
void g2_lock_stream(void) {
    if (g2_stream_locked) return;
    g2_stop_comm();
    g2_stream_locked = 1;
}

void g2_unlock_stream(void) {
    if (!g2_stream_locked) return;
    g2_stream_locked = 0;
    g2_rearm();
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
