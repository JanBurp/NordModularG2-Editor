/*
 * G2 CLI - Big-endian bit-stream reader
 *
 * Reads arbitrary-width fields from binary patch data. The G2 stores patch
 * parameters as packed big-endian bit fields; this module provides the
 * positional reader that the parser relies on.
 */

#ifndef BITSTREAM_H
#define BITSTREAM_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    const uint8_t *data;
    size_t len;
    int bit_pos;
} bitstream_t;

void bitstream_init(bitstream_t *bs, const uint8_t *data, size_t len);
uint32_t bitstream_read_bits(bitstream_t *bs, int nbits);
void bitstream_seek_bit(bitstream_t *bs, int bit_pos);
int bitstream_tell_bit(bitstream_t *bs);

#endif
