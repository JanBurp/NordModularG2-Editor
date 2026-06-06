# Clock Generator (ClkGen)

The Clock Generator module generates a stream of logic signals. The Clock Generator can either act on its own or use the Master Clock signal. If you want to sync to external MIDI CLOCK, you must select Master Clock as Source and then sync the Master Clock to external MIDI CLOCK. For examples on how to use the Clock Generator together with Sequencer modules, see "Sequencing examples".

## Parameters (alphabetical)

### Active
Starts and stops the output of clock pulses.

### BeatSync
Here you set the interval for sending a logic pulse on the Sync output of the Clock Generator module. This logic pulse can be used for resetting the sequencer modules in Nord Modular G2 to the "first beat in the bar". If you do not use the Sync function, the sequencer modules have no chance of knowing where they are in a bar. By using the Sync function, it will never take longer than the set number of beats for the sequencer modules to realign themselves if you decide to start your sequencer modules in the middle of a song.

If you are synchronizing Nord Modular G2 to a MIDI Clock source, this function will also keep track of any incoming MIDI Song Position Pointer messages.

### Rate
Set the desired tempo, in beats per minute, with the knob. Range: 24 to 214 BPM. The tempo is shown in the display box to the left of the knob. If Master is selected as Clock Source, the tempo is selected in the Master Clock section in the Toolbar.

### Source
Click the scroll button to select Internal or Master Clock signal. If Master is selected, the tempo is selected in the Master Clock section in the Toolbar.

### Swing
Set the desired swing factor of the output clock signal. Range: 50%-75%.

## Inputs

### Rst
The yellow Reset input forces the clock generator to restart on the positive edge of a logic HIGH reset pulse. If the reset signal is not a logic signal, e.g. a blue signal, it will first be transformed to a logic signal before being used. This signal could come from a Gate output of a Keyboard module, for example. When the clock generator is reset, it also transmits a high logic signal on the Sync output.

## Outputs

### 1/16
This yellow output transmits 16 clock pulses per quarter bar (or 4 clock pulses for each quarter note). Signal: Logic.

### 1/96
This yellow output transmits 96 clock pulses per quarter bar (or 24 clock pulses for each quarter note). Signal: Logic.

### ClkActive
This yellow output provides you with a logic HIGH signal when the Click Generator is switched on in Internal Clock Source mode. If you have selected Master Clock Source, the Active output will send a logic HIGH signal as soon as a MIDI Start or MIDI Continue command is received at the MIDI IN port. The logic signal will switch back to LOW when Nord Modular G2 receives a MIDI Stop signal at the MIDI IN port. When the G2 does not receive MIDI CLOCK the active output will follow the RUN/STOP state of the G2 Master Clock. Signal: Logic.

### Sync
This yellow output provides you with a logic pulse, which is calculated from the Clock signal, at a rate set by the 'Sync every nn beats' parameter mentioned above. The Sync function provides a method of telling the Nord Modular G2 sequencer modules where the first beat in a bar is. Patch this output to the Rst (reset) input of the sequencer modules. This function is absolutely essential to use if you plan to synchronize patches in different slots to each other, or if you want to synchronize Nord Modular G2 to an external sequencer. Signal: Logic.