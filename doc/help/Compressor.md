# Compressor

This module reduces the dynamic range of an audio signal by compressing peaks and evening out volume fluctuations.

## Parameters (alphabetical)

### Threshold

Sets the level above which compression begins. Higher values require a louder signal to trigger compression.

### Ratio

Sets the compression ratio. Higher ratios produce more aggressive compression.

### Attack

Sets how quickly the compressor responds when the threshold is exceeded.

### Release

Sets how quickly the compressor returns to normal gain after the signal falls below the threshold.

### Makeup Gain

Boosts the output level to compensate for volume reduction caused by compression.

## Inputs

### In1

Audio input signal to compress.

### Mod (Threshold)

Modulation input for the Threshold parameter.

## Outputs

### Out1

Compressed audio output.

### Gain Reduction

Outputs a signal indicating the amount of gain reduction being applied.

## Note

Controls peaks and evens out the dynamic range.