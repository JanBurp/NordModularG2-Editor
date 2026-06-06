# LfoB

LFO B generates one of four different control signals. The phase of the signal can be controlled and modulated. The rate of the LFO can be modulated by a modulation source and the keyboard. The wave cycle can also be forced to restart via the Rst input. See also "Common LFO parameters".

## Common LFO Parameters

**RATE, RANGE:** The Rate knob sets the LFO speed. The Range button selects one of five rate scaling modes: Rate Sub, Rate Lo, Rate Hi, BPM, or Clock.
- Rate Sub: 699s to 5.46s period
- Rate Lo: 62.9s to 24.4 Hz
- Rate Hi: 0.26 Hz to 392 Hz
- BPM: 24 to 214 (synced to tempo)
- Clock: Note value from 64/1 to 1/64T

**PHASE:** Controls the starting phase offset of the LFO waveform in degrees (0-357).

**RST INPUT:** Resets the LFO waveform to its starting point when a signal is received.

**SNC OUTPUT:** Sync output - sends a pulse when the LFO cycle restarts.

**POLY/MONO:** Switch between Poly (multiple voices, each with own LFO phase) and Mono (single voice, LFO restarts with each note).

**KBT:** KeyBoard Tracking - determines how the LFO rate responds to keyboard pitch. Options: Off, 25%, 50%, 75%, 100%.

**OUTPUT TYPE:** Determines the output signal range:
- BIP: Bipolar (-64 to +64)
- BIPINV: Bipolar inverted
- POS: Positive (0 to +64)
- POSINV: Positive inverted
- NEG: Negative (-64 to 0)
- NEGINV: Negative inverted

**ON/OFF:** Blue button color indicates the LFO is active (ON).

**OUTPUT:** The signal output. Signal: BIPOLAR

## Parameters

**Active** (ActiveMonitor)
Toggles the LFO between Monitor and Active modes. Blue button color indicates the LFO is active.

**Kbt** (Kbt_4)
KBT, KeyBoard Tracking. Determines how the LFO rate responds to keyboard pitch. Options: Off, 25%, 50%, 75%, 100%.

**OutputType** (OutTypeLfo)
Output signal range selector. Options: Pos, PosInv, Neg, NegInv, Bip, BipInv.

**Phase** (Phase)
Controls the starting phase offset of the LFO waveform in degrees (0-357).

**PhaseMod** (Level_100)
Phase modulation amount. Modulates the phase offset via the Phase input.

**PolyMono** (PolyMono)
Switch between Poly (multiple voices) and Mono (single voice) operation.

**Range** (LfoRange_4)
Rate scaling mode selector. Options: Rate Sub, Rate Lo, Rate Hi, BPM, Clock.

**Rate** (LfoRate_4)
LFO speed control. The effective range depends on the Range setting.

**RateMod** (Level_100)
Rate modulation amount. Modulates the LFO rate via the Rate and RateVar inputs.

**Waveform** (LfoB_Waveform)
Waveform selector. The waveforms are: Sine, Triangle, Sawtooth, Square.

## Inputs

**Phase** (blue)
Phase modulation input. Modulates the LFO phase offset.

**Rate** (blue)
Rate modulation input. Modulates the LFO rate.

**RateVar** (blue)
Additional rate modulation input. Combined with the Rate input for modulation.

**Rst** (blue)
Reset input. Forces the LFO waveform to restart when a signal is received.

## Outputs

**Out** (blue)
LFO signal output. Signal: Bipolar

**Sync** (blue)
Sync output. Sends a pulse when the LFO cycle restarts.