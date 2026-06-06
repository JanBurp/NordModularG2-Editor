# MonoKey

**Group:** In/Out

## Description

This module provides three different control signals to emulate the keyboard behaviour of a classic monophonic synth. The signals are generated from the last/lowest/highest note (depending on the alternative below) played and affect all allocated voices, in contrast to the Keyboard module described above.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Parameters

**Mode** (MonoKeyMode)
Select which notes should be output. 'Last' will output the data from the latest key played. 'Lo' will output data from the lowest key played and 'Hi' from the highest key played.

Tips! The Lo and Hi alternatives are perfect for creating a polyphonic Patch with a separate sound for the bass (Lo) or lead (Hi) lines. Patch the Pitch and Gate outputs (see below) to the bass/lead sound oscillator(s) Pitch input and the Envelope Gate input. Disable the Oscillator KBT and Envelope KB functions.

## Outputs

**Pitch** (blue)
This blue output provides you with a complete pitch (note number + any pitch bend and/or glide) signal from the last/lowest/highest note (depending on the alternative above) played on the keyboard, or received at the MIDI IN port. E4 (MIDI note 64), which is the middle E on the Nord Modular G2 keyboard when the OCT SHIFT selector is in the center position, represents a signal level of 0 units. MIDI note 0 (C-1) represents -64 units and MIDI note 127 (G9) represents +63 units. Signal: Bipolar.

**Gate** (yellow)
This yellow output sends a HIGH logic level (+64 units) every time a key is pressed on the keyboard or a MIDI note-on is received at the MIDI IN port. The logic signal switches back to a LOW logic level (0 units) when the last key is released. You can use this signal to start envelopes in the single-trigger fashion. If a sustain pedal is activated, the logic signal will be HIGH for as long as the pedal is pressed. Signal: Logic.

**Vel** (blue)
This blue output provides you with a control signal from the last/lowest/highest (depending on the alternative above) note-on velocity. The velocity response of the Nord Modular G2 keyboard is linear from this output. Signal: Unipolar Positive.