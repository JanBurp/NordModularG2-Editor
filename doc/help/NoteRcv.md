# NoteRcv

**Group:** In/Out

## Description

The Note Receive module receives MIDI Note messages from external controllers or software, and converts them to note, velocity, and gate signals within the patch.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Parameters

**Channel** (knob)
Set the MIDI channel. Range: 1-16.

## Outputs

**Note** (blue)
The received note number. E4 (MIDI note 64) represents 0 units. Range: C-1 (-64 units) to G9 (+63 units). Signal: Bipolar.

**Vel** (blue)
The received note velocity. Signal: Unipolar Positive.

**Gate** (yellow)
A gate signal triggered by incoming notes. Logic HIGH when a key is pressed, logic LOW when released. Signal: Logic.