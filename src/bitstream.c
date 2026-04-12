#include <stdlib.h>
#include <string.h>
#include "../include/bitstream.h"

void bitstream_init(bitstream_t *bs, const uint8_t *data, size_t len) {
    bs->data = data;
    bs->len = len;
    bs->bit_pos = 0;
}

static uint32_t get_bits(const uint8_t *data, int bit, int nbits) {
    uint32_t val = 0;
    for (int i = 0; i < nbits; i++) {
        int byte_idx = (bit + i) / 8;
        int bit_idx = 7 - ((bit + i) % 8);
        if (byte_idx < (int)(sizeof(data) * 8)) {
            val = (val << 1) | ((data[byte_idx] >> bit_idx) & 1);
        }
    }
    return val;
}

uint32_t bitstream_read_bits(bitstream_t *bs, int nbits) {
    uint32_t val = 0;
    for (int i = 0; i < nbits; i++) {
        int byte_idx = bs->bit_pos / 8;
        int bit_idx = 7 - (bs->bit_pos % 8);
        if (byte_idx < (int)bs->len) {
            val = (val << 1) | ((bs->data[byte_idx] >> bit_idx) & 1);
        }
        bs->bit_pos++;
    }
    return val;
}

void bitstream_seek_bit(bitstream_t *bs, int bit_pos) {
    bs->bit_pos = bit_pos;
}

int bitstream_tell_bit(bitstream_t *bs) {
    return bs->bit_pos;
}
