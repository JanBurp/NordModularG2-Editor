# KeyQuant

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

This module will first scale down the input signal according to the Range setting. Then it will quantize the scaled input signal to the closest exact semitone which fits in the scale set by the mini-keyboard.

## Parameters

**Range** (NoteRange)
Scales down a full input signal range between -64 to +64 semitones to the smaller range as shown in the associated display. If the input range is smaller than full range, e.g. between -32 and +32 semitones, then the actual output range will be also half of the range shown in the display. Note that one semitone corresponds to 1 unit in a signal level.

**Capture** (KeyQuantCapture)
Select 'Evenly' with this button to force the module to "split up" the key quantization grid in equally big sections per octave.

We have selected the notes E, F and F# to quantize to in every octave. The Capture function is set to 'Closest'. As you can see, the quantization will be to the closest matching note.

When the Capture function is set to 'Evenly', the input signal will be quantized to the selected notes in equal sections, per octave, across the selected range.

**One Octave Mini-Keyboard Buttons**
Click a button on the mini-keyboard to highlight notes that you want to quantize to. The note interval for the shown octave is automatically duplicated across the whole key Range.

## Inputs

**In** (blue)
The Range control signal input.

## Outputs

**Out** (blue)
Signal: Bipolar.

**Example**
The example below shows the principle for creating a simple arpeggiator. LFO A is set to generate a triangle wave, since this signal has linear, symmetrical ramps. This guarantees even change of control values over time. Press four Note buttons on the module's mini-keyboard and selected a Range of +/- 32 semitones on the KeyQuant module. The output signal from the KeyQuant module is routed to the direct, unattenuated Pitch input of the Osc A module to ensure correct semitone intervals.

Select Capture 'Evenly' to make the notes be output at a steady rate when controlled from the Triangle wave LFO.