# Glide

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

This module will smooth or slew sudden transitions in level of a control signal. This will create a glide effect between 'jumping' values in a control signal, similar to the portamento effect. You can think of this module as a lowpass filter for control signals. The glide effect can be linear (which will produce a longer glide time if the input signal value makes a bigger jump in value) or logarithmic (basically the same glide time for smaller and bigger jumps in input value).

Tip! To make a legato introduced portamento on notes played on the G2 keyboard, it is often more convenient to use the Keyboard Glide function in the Patch|Patch Settings window.

## Parameters

**On** (OffOn)
Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

**Time** (GlideTime)
Sets the transition (glide) time with the knob. Log Range: 0.2 msec to 22.4 sec. Lin Range: 0.2 msec/octave to about 23.5 seconds/octave

**Shape** (LogLin)
Select 'Lin' (different time depending on the range between adjacent input values) or 'Log' (basically the same time regardless of the range between adjacent input values).

## Inputs

**In** (purple)
The blue control signal input.

**On** (orange)
Patch a high logic signal here to activate the gliding transition between the input signal levels (if the Glide button is off). If no connection is made, the portamento can be controlled with the Glide button.

## Outputs

**Out** (purple)
Signal: Bipolar.