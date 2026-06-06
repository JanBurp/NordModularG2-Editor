# Mix2-1B

Two-input mixer with per-channel attenuation and phase inversion.

## Inputs

- **Input 1** — Dynamic control/audio signal with dedicated attenuation
- **Input 2** — Dynamic control/audio signal with dedicated attenuation

## Parameters

| Parameter | Description |
|-----------|-------------|
| **Attenuation** | Per-channel level control |
| **INV** | Inverts the input signal polarity (phase shift 180°) |

## Notes

Use INV to subtract control signals instead of adding them, or to mix audio signals in anti-phase.