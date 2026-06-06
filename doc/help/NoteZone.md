# NoteZone

The Note Zone module filters and maps incoming MIDI notes to a specific zone range.

## Parameters

**Low Note** — Set the lowest note of the zone. Range: 0–127.

**High Note** — Set the highest note of the zone. Range: 0–127.

**Transpose** — Set the transpose amount in semitones. Range: –24 to +24.

## Inputs

| Input | Description |
|-------|-------------|
| In1 | MIDI note input |

## Outputs

| Output | Description |
|--------|-------------|
| Out1 | Filtered and transposed note output |

## Notes

Used to split the keyboard into zones, each controlling different parts of the patch.