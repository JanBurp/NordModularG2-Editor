# NoteQuant

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

This module will first scale down the input signal according to the Range setting. Then it will quantize the scaled input signal to the closest exact semitone which fits in the semitone scale set by the Notes control.

## Parameters

**Range** (NoteRange)
Scales down a full input signal range between -64 to +64 semitones to the smaller range as shown in the associated display. If the input range is smaller than full range, e.g. between -32 and +32 semitones, then the actual output range will be also half of the range shown in the display. Note that one semitone corresponds to 1 unit in a signal level.

**Notes** (NoteQuantNotes)
Sets the desired quantization interval in a number of exact semitones. Range: Off and 1 to 127 semitones.

## Inputs

**In** (blue)
The blue control signal input.

## Outputs

**Out** (blue)
Signal: Bipolar.