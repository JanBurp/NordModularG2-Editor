# BinCounter (Binary Counter)

The Binary Counter module counts in binary and outputs the count as individual bit signals. Each bit output represents one digit of the binary number, allowing complex timing patterns and addressing schemes.

## Parameters

### Max Count

Sets the maximum count value. Range: 1-255. When the counter reaches this value, it wraps back to 0 on the next clock pulse.

## Inputs

### Clk

Clock input. Each positive edge (LOW to HIGH transition) increments the count by 1.

### Rst

Reset input. When triggered, resets the count to 0.

## Outputs

### Bit outputs

Individual binary bit outputs. The number of outputs depends on the Max Count setting. Each output is HIGH when that bit position in the current count value is set to 1.

**Note:** Useful for creating complex timing patterns or addressing multiple destinations in sequence.