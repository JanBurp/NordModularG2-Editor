# FltMulti (Multimode Filter)

A multimode filter with selectable slope of 6 or 12 dB/octave and resonance control. Three simultaneous outputs: highpass (HP), lowpass (LP), and bandpass (BP). Cut-off frequency and resonance can be modulated from external sources.

## FILTER MODES

The dB/Oct radio button can change the LP and HP outputs to 6dB slopes. The BP output however is changed into an allpass output when the filter is in 6dB mode.

An allpass filter will pass all frequencies, but will have two effects on a sound. The first effect is that all partials are shifted in phase, higher partials are shifted more as lower partials. This phase shifting effect is not heard unless the output is mixed with other (allpass filtered) sounds of the same basic pitch.

The second effect is that when the resonance is opened a strong resonant peak occurs at the cutoff frequency. And this effect can be put to very good use when e.g. filtering audio samples. The peak can significantly boost a small frequency band in the sample, without filtering away the high or the low.

Interesting application is to e.g. sweep the peak with a triangle LFO over a drumsample fed into a Line In input. Note that the allpass filter appears to be inverted in respect to the input signal.

## Parameters (alphabetical)

### Cutoff

Sets the initial cut-off frequency.

### Resonance

Controls the resonance peak.

### dB/OCT

Selectable slope: 6 or 12 dB/Oct.

## Inputs

### IN

Audio input.

### Mod

Modulation input for cut-off frequency.

## Outputs

### HP

Highpass output.

### LP

Lowpass output.

### BP

Bandpass output (becomes allpass in 6dB mode).

## Graph

Visual representation of the multimode filter characteristics.