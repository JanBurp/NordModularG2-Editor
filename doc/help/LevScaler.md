# LevScaler

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

This module is used to scale the level of a signal depending on either a position on the keyboard (KBT=ON and Note input is not used) or depending on the value of a control signal (KBT =OFF and the control signal is connected to the Note input). This module is useful to create variable Keyboard Scaling, like used on some FM synthesizers. To create the Keyboard Scaling, first set a break point key and then set different amplification/attenuation slopes for the sections on either side of the break point. The scaling will be applied to the signal connected to the input in the upper right corner and the scaled input signal will be available on the output in the lower right corner. An internal gain controller or VCA is used to do the actual scaling. The control signal that controls this internal gain controller is available on the Level output and can be used to 'slave' other LevMult modules. Note that when the L and R controls are set to 0.0dB no scaling takes place and the gain of the internal gain controller is unity. Which means that the Level output will in this case produce a value of +64 units, no matter what note is played on the keyboard.

## Parameters

**L** (LevScaledB)
Set the amplification/attenuation slope for the lower key section with the knob. The value is displayed in the corresponding display box. Range: +/-8.0 dB per octave.

**BP** (FreqCoarse)
Set the break point note number. The value is displayed in the corresponding display box. Range: C-1 to G9.

**R** (LevScaledB)
Set the amplification/attenuation slope for the upper key section with the knob. The value is displayed in the corresponding display box. Range: +/-8.0 dB per octave.

**Kbt** (Kbt_1)
This is an internally hard-wired connection for the LevScaler module to the keyboard (and the MIDI input). If KBT is set to ON the LevScaler will track the keyboard at the rate of one semitone for each key. If KBT is set to OFF, the keyboard will not affect the LevScaler Note control.

## Inputs

**Note** (blue)
An optional control signal to control the scaling. Patch this input to e.g. the Pitch or Note outputs of the Keyboard input module. Alternatively, the module can be used as a waveshaper for Lfo waveforms. Do this by connecting a triangle waveform to the Note input and setting the KBT button to OFF. Take the output from the Level output and tweak the L, R and Breakpoint controls. Best results are when both the L and R controls are set to negative dB values (turn knobs left). Note that when the L and R controls are both set to 0.0dB the Level output produces a steady level of +64 units. Judge results by ear.

**In** (purple)
The DYNAMIC AUDIO/CONTROL signal input to the internal gain control function. Patch for example an Oscillator audio signal here and patch the output to a FM input of another oscillator.

## Outputs

**Level** (blue)
The output value is the combined result of the note input and scaling values. Signal: Unipolar.

**Out** (purple)
The output of the amplified/attenuated input signal. Signal: Bipolar.

## Graph

Displays the two gain slopes and the break point graphically. The Y-axis represents the output level (logarithmic) and the X-axis the entire note range (C-1 to G9). the horizontal line represents the +64 units (0 dB) output level.