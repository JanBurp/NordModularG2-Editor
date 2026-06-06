# NoteDet

**Group:** In/Out

## Description

This module can detect if a certain a note is played, either on the Nord Modular G2 keyboard, on the MIDI IN connector, or when sent from another Slot with a MIDI NoteSend module with the Slot this module is in as destination. This module is commonly used to trigger drum or percussive sounds assigned to a fixed MIDI note. A logic HIGH signal will be transmitted, together with a velocity control signal, when the selected key is detected. The logic signal will switch to a logic LOW signal, and a release velocity control signal will be sent, when the selected key is released. The Note Detect module is global and affects all voices assigned in a patch. The behavior is similar to the MonoKey module described on page 159. The Note detect module is not affected by the polyphony of the patch. It will detect notes, even if you run out of polyphony.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Parameters

**Note** (MidiNote)
Select the note to be detected. Range: C-1 to G9.

## Outputs

**Gate** (yellow)
Logic signal: High when the selected note is on, low when off.

**Vel** (blue)
Velocity (linear Velocity signal): Unipolar Positive.

**RelVel** (blue)
RelVel (linear Release Velocity signal): Unipolar Positive.