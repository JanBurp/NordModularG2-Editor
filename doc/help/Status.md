# Status

**Group:** In/Out

## Description

The Status module is an extremely useful module for controlling things in a Patch. It gives you the possibility to control or define events on the moment when you load a Patch (e.g. to send specific MIDI commands) and also when you switch between Variations in the Patch. It also gives you the possibility to control your Patch depending on which individual voice is used.

## Common In/Out Module Parameters

**ON/OFF:** Click the On/Off button to mute the signal(s) of the In/Out module. Blue color indicates 'On' and gray 'Mute'.

## Outputs

**PatchActive** (yellow)
Provides you with a logic HIGH signal (+64 units) as soon as a Patch is loaded into a Slot or activated. This signal can be used to reset or sync events in the Patch that you want to reset automatically after Patch load. Signal: Logic.

**VarActive** (yellow)
Provides you with a logic HIGH signal (+64 units) as soon as a Variation is active. When you switch between Variations, the signal drops to a logic LOW (0 units) for a short while and then immediately raises to a logic HIGH (+64 units) again. This signal can be used to reset, sync or start events in the currently selected Variation of the Patch that you want to reset, sync or start automatically immediately after you switched from another Variation to the current Variation. Signal: Logic.

**VoiceNo** (blue)
The blue Voice No output sends out a Ctrl signal value for the voice number currently used. This means you can control each voice in a polyphonic patch separately. The Ctrl values for the voice numbers sent out from the Voice No output corresponds to the ranges of the Ctrl inputs of the Multiplexer modules in the Switch group and also the Volt input of the Volt Sequencer module. The output Ctrl signal output values are these: Voice 1: 0, Voice 2: 4, Voice 3: 8, Voice 4: 12, Voice 5: 16, Voice 6: 20, Voice 7: 24, Voice 8: 28, Voice 9: 32, Voice 10: 36, Voice 11: 40, Voice 12: 44, Voice 13: 48, Voice 14: 52, Voice 15: 56, Voice 16: 60, Voice 17: 64, Voice 18: 68, Voice 19: 72, Voice 20: 76, Voice 21: 80, Voice 22: 84, Voice 23: 88, Voice 24: 92, Voice 25: 96, Voice 26: 100, Voice 27: 104, Voice 28: 108, Voice 29: 112, Voice 30: 116, Voice 31: 120 and Voice 32: 124.

As you can see, the output Ctrl signal has double the range compared to general control signals. This means that if you want to control general control signal applications you need to add a negative offset for Voice 17 and above to not hit the +64 units "headroom" of the control signal inputs.

**Example 1: 4 Separately Detuned Voices**
Let's say you want to simulate an old analog 4 voice synthesizer which has slightly different oscillator tunings for each voice. Use the Status module and the Volt Sequencer module and patch the Voice No output to the Volt input of the Volt Sequencer. Then, set the Voice Mode in the Patch window to 4 voices. Click the Clr button on the Volt Sequencer to set each step to 0 units. Then, set each of the four first steps of the Volt Sequencer slightly differently. Then patch the Volt Sequencer control signal output to the Oscillator A Pitch modulation input and raise the attenuator knob a bit. Now, play and add a key at a time till you play a 4 note chord. Each of the voices sound slightly detuned as we would expect. Release one of the keys and press it again. Now, the same voice sounds again with its unique tuning.

**Example 2: 4 Voices and 4 Waveforms**
By using the Voice No output of the Status module in combination with the Ctrl input of an 8-1Multiplexer module, you can create polyphonic Patches that have completely different sounds for each individual voice. This example shows a 4 voice polyphonic Patch with separate oscillators and waveforms for each voice.