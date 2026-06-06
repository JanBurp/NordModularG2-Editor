# Mix4-1B

Four-input mixer with per-channel attenuation and exponential/linear response curve.

## Inputs

- **In1** — Dynamic control/audio signal with dedicated attenuation
- **In2** — Dynamic control/audio signal with dedicated attenuation
- **In3** — Dynamic control/audio signal with dedicated attenuation
- **In4** — Dynamic control/audio signal with dedicated attenuation
- **Chain** — Signal chain input for cascading multiple mixer stages

## Parameters

| Parameter | Description |
|-----------|-------------|
| **Lev1** | Attenuation control for Input 1 |
| **Lev2** | Attenuation control for Input 2 |
| **Lev3** | Attenuation control for Input 3 |
| **Lev4** | Attenuation control for Input 4 |
| **ExpLin** | Switches between exponential and linear response curves |

## Outputs

- **Out** — Mixed signal output

## Notes

The ExpLin switch selects whether the level controls respond exponentially (better suited for audio mixing) or linearly (better suited for control signal mixing).