# ZeroCnt

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

The Zero Crossing Counter module can be used for detecting the pitch of input signals of a single simple waveform. Note that for this module the input signal has to be fairly simple regarding harmonic content. The practical pitch detection range is equal to the default oscillator pitch range when tracking a red or orange signal, or the default Lfo range when tracking a blue or yellow signal (set Lfo to 0.64 Hz).

The PitchTrack module uses a simple method which measures the time between two positive zero crossings of the audio input signal. The measured time is then transformed into the Pitch control signal output value. The advantage of this method is that it is very fast, the Pitch value is available immediately at the end of each waveform cycle in the input signal. But this method expects reasonably simple waveforms and cannot handle chords or complex waveforms where the waveform crosses the zero line several times during one cycle.

## Inputs

**In** (purple)
The input of the ZCounter module.

## Outputs

**Out** (blue)
Signal: Bipolar

**Example of Tap Tempo**
In this example the rate of the lfo can be set by tapping two times on the Tap button. The time between the two times will be measured and held on the ZeroCnt output. Note that while tapping a new tempo, the Rate in between the first two taps on the tap button is basically undefined.