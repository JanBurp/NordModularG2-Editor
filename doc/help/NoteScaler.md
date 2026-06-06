# NoteScaler

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

This module works like a control signal attenuator, with a scale display that makes it easy to process keyboard note values. You set the output peak-to-peak limits in semitones. This could be useful if you want to "tune" the works with either uni- or bipolar signals.

## Parameters

**Range** (NoteRange)
Scales down a full input signal range between -64 to +64 semitones to the smaller range as shown in the associated display. If the input range is smaller than full range, e.g. between -32 and +32 semitones, then the actual output range will be also half of the range shown in the display. Note that one semitone corresponds to 1 unit in a signal level.

## Inputs

**In** (blue)
The blue control signal input.

## Outputs

**Out** (blue)
Signal: Bipolar.