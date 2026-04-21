#include <stdlib.h>
#include <string.h>
#include "../include/bitstream.h"

void bitstream_init(bitstream_t *bs, const uint8_t *data, size_t len) {
    bs->data = data;
    bs->len = len;
    bs->bit_pos = 0;
}

uint32_t bitstream_read_bits(bitstream_t *bs, int nbits) {
    /* Match Python's getbits algorithm:
     * 1. byte = bit >> 3
     * 2. Read 4 bytes starting at 'byte' (or less if near end)
     * 3. Combine into 32-bit big-endian word
     * 4. Extract nbits from word starting at position (32 - (bit&7) - nbits)
     */
    uint32_t val = 0;
    int bit = bs->bit_pos;
    int byte_idx = bit >> 3;
    
    if (byte_idx >= 0 && byte_idx < (int)bs->len) {
        /* Build 32-bit word from up to 4 bytes, big-endian style */
        uint32_t word = 0;
        
        for (int i = 0; i < 4 && byte_idx + i < (int)bs->len; i++) {
            word = (word << 8) | bs->data[byte_idx + i];
        }
        /* Pad remaining bytes with zeros (already done by initialization) */
        
        /* Now extract nbits from MSB side of the word */
        /* Position within word: 32 - (bit&7) - nbits */
        int shift = 32 - (bit & 7) - nbits;
        if (shift < 0) shift = 0;
        
        val = (word >> shift) & ((1 << nbits) - 1);
    }
    
    bs->bit_pos = bit + nbits;
    return val;
}

void bitstream_seek_bit(bitstream_t *bs, int bit_pos) {
    bs->bit_pos = bit_pos;
}

int bitstream_tell_bit(bitstream_t *bs) {
    return bs->bit_pos;
}
