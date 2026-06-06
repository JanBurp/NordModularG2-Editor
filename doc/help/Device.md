# Device

**Group:** In/Out

## Description

The Device module represents a number of physical controls on the synth and routes their respective control signals for use in the Patch.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Outputs

**Wheel** (blue)
The blue Wheel output provides a positive control signal according to the position of the MOD WHEEL. Signal: Unipolar Positive.

**AftTouch** (blue)
The blue Aftertouch output provides a positive control signal according to the current Keyboard Aftertouch value. Signal: Unipolar Positive.

**ControlPedal** (blue)
The blue Control Pedal output provides a positive control signal according to the position of a connected Control/Expression pedal. Signal: Unipolar Positive.

**SustainPedal** (yellow)
The yellow Sustain Pedal output provides a logic HIGH signal (+64 units) as soon as a connected sustain pedal is depressed. In the system menu you can set if the Sustain pedal is of a 'make-contact or 'break-contact' type. Signal: Logic. See also Sustain Pedal Polarity in the system menu documentation.

**PitchStick** (blue)
The blue Pitch Stick output provides both the negative and positive control signal range of the PITCH STICK. It will output a signal as soon as the PITCH STICK is moved. Signal: Bipolar.

**GlobalWheel1** (blue)
Global wheel 1 control signal output.

**GlobalWheel2** (blue)
Global wheel 2 control signal output.