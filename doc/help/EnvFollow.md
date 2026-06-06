# EnvFollow

The Envelope Follower module creates a control signal based on the envelope of an incoming audio signal. This is useful for creating dynamic effects or controlling parameters based on the audio content.

## Inputs

| Jack | Description |
|------|-------------|
| In1 | The audio signal to be analyzed |

## Outputs

| Jack | Description |
|------|-------------|
| Out1 | The resulting envelope control signal |

## Controls

| Knob | Range | Description |
|------|-------|-------------|
| ATTACK | 0–100% | Sets the attack time |
| RELEASE | 0–100% | Sets the release time |

The module tracks the amplitude envelope of the input signal and outputs a corresponding control signal.