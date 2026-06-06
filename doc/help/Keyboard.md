# Keyboard

**Group:** In/Out

## Description

The Keyboard voice module gives you access to a few basic and important signals associated with the keyboard on Nord Modular G2, or a keyboard connected to the synth via MIDI In. The signals are generated from each key played and affect one voice at a time.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Outputs

**Pitch** (blue)
This blue output provides you with a pitch control signal that is a mix of the value for the played note plus pitch bend plus glide values from the Nord Modular G2 KEYBOARD or from the MIDI IN port. This same signal is also hardwired internally in a patch to every module that has a KBT control or button. The pitch bend value is scaled before it is combined with the note information. The pitch Bend Range parameter controls the scaling amount, or in other words the sensitivity of the pitchstick. This ratio can be set from the G2 frontpanel or in the Patch Settings menu. The note E4 (MIDI note 64), which is the middle E on the Nord Modular G2 keyboard when the OCT SHIFT selector is in the center position, represents an output signal level of 0 units. Each half note up or down on the keyboard will increase or decrease the value by one unit. MIDI note 0 (C-1) represents -64 units and MIDI note 127 (G9) represents +63 units. Signal: Bipolar.

**Gate** (yellow)
This yellow output sends a logic HIGH signal (+64 units) every time a key is pressed on the keyboard, or a MIDI note-on is received at the MIDI IN port. The logic signal switches back to a logic LOW signal (0 units) when the key is released. If a sustain pedal is activated, the logic signal will be HIGH for as long as the pedal is pressed. Signal: Logic.

**Lin** (blue)
This blue output transmits the note-on velocity signals from the keys that you play on the Nord Modular G2 or any velocity that is received on the MIDI IN port. The velocity response of the Nord Modular G2 keyboard is linear on the Lin Vel output. Signal: Unipolar Positive.

**Release** (blue)
This blue output provides you with the release velocity signal from the keys that you play on the Nord Modular G2, or any release velocity that is received via MIDI. The release velocity response of the Nord Modular G2 keyboard is linear. Signal: Unipolar Positive.

**Exp** (blue)
This blue output transmits the note-on velocity signals from the keys that you play on the Nord Modular G2 or any velocity that is received on the MIDI IN port. The velocity response of the Nord Modular G2 keyboard is exponential on the Exp Vel output. Signal: Unipolar Positive.

**Note** (blue)
This blue output provides only the Note number value as a control signal, so without any additional pitch bend or glide data. E4 (MIDI note 64), which is the middle E on the Nord Modular G2 keyboard when the OCT SHIFT selector is in the center position, represents an output signal level of 0 units. MIDI note 0 (C-1) represents -64 units and MIDI note 127 (G9) represents +63 units. Signal: Bipolar.