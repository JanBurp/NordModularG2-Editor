import type { ParamDefinition } from '../types/index.ts';

// prettier-ignore
const parammap: Record<string, ParamDefinition> = {
	ActiveMonitor: { names: [''], width: 11, bmp: 'pwr', low: 0, high: 1, def: 1, defin: ['0 ~ Monitor,1 ~ Active '], comments: '' },
	AdAr: { low: 0, high: 1, def: 0, defin: ['0 ~ AD, 1 ~ AR'], comments: 'Selects between Decay and Release modes' },
	Bipolar_127: { low: 0, high: 127, def: 0, defin: ['0 ~ -64, 64 ~ 0, 127 ~ 64'], comments: 'not necesarraly a linear control' },
	BipPosNeg: { names: ['Bip', 'Pos', 'Neg'], width: 22, low: 0, high: 2, def: 0, defin: ['0 ~ Bip, 1 ~ Pos, 2 ~ Neg'], comments: '' },
	BipUni: { names: ['Bip', 'Uni'], width: 18, low: 0, high: 1, def: 0, defin: ['0 ~ Bip, 1 ~ Uni'], comments: 'Determines display for [LevBipUni]' },
	ClassicSlope: { names: ['12', '18', '24'], low: 0, high: 2, def: 0, defin: ['0 ~ 12, 1 ~ 18, 2 ~ 24'], comments: '' },
	ClipShape: { width: 24, low: 0, high: 1, def: 0, defin: ['0 ~ Asym, 1 ~ Sym'], comments: '' },
	ClkDivMode: { low: 0, high: 1, def: 0, defin: ['0 ~ Gated, 1 ~ Toggled'], comments: 'Gated mode follows input clocks positive pulse width' },
	ClkGenBeatSync: { low: 0, high: 5, def: 2, defin: ['0 ~ 1, 1 ~ 2, 2 ~ 4, 3 ~ 8, 4 ~ 16, 5 ~ 32'], comments: '' },
	ClkGenSwing: { low: 0, high: 127, def: 0, defin: ['0 ~ 50.0%, 64 ~ 62.6%, 127 ~ 75.0%'], comments: '' },
	CombType: { width: 28, low: 0, high: 2, def: 0, defin: ['0 ~ Notch, 1 ~ Peak, 2 ~ Deep'], comments: '' },
	CompressorAttack: { low: 0, high: 127, def: 1, defin: ['0 ~ Fast, 1 ~ 0.53 m, 64 ~ 20.2 m, 127 ~ 767 m'], comments: '' },
	CompressorRatio: { low: 0, high: 66, def: 20, defin: ['0 ~ 1.0:1, 20 ~ 4.0:1, 66 ~ 80:1'], comments: '' },
	CompressorRefLevel: { low: 0, high: 42, def: 30, defin: ['0 ~ -30 dB, 30 ~ 0 dB, 42 ~ 12 dB'], comments: '' },
	CompressorRelease: { low: 0, high: 127, def: 20, defin: ['0 ~ 125 m, 20 ~ 250 m, 64 ~ 1.15 s, 127 ~ 10.2 s'], comments: '' },
	DelayRange_1: { low: 0, high: 2, def: 0, defin: ['0 ~ 500 m, 1 ~ 1.0 s, 2 ~ 2.0 s, 3 ~ 1.35 s'], comments: 'Determines [DelayTime_1]' },
	DelayRange_2: { low: 0, high: 3, def: 0, defin: ['0 ~ 500 m, 1 ~ 1.0 s, 2 ~ 2.0 s, 3 ~ 2.7 s'], comments: 'Possibly determines [DelayTime_1], [DelayTime_2] and [DelayTime_3]' },
	DelayRange_3: { low: 0, high: 6, def: 0, defin: ['0 ~ 5 m, 1 ~ 25 m, 2 ~ 100 m, 3 ~ 500 m, 4 ~ 1.0 s, 5 ~ 2.0 s, 6 ~ 2.7 s'], comments: 'Determines [DelayTime_3]' },
	DelayTime_1: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.01 m, 64 ~ 252 m, 127 ~ 500 m', '0 ~ 0.01 m, 64 ~ 504 m, 127 ~ 1.000 s', '0 ~ 0.01 m, 64 ~ 661 ms, 127 ~ 1.351 s', '0 ~ 1/64 T, 64 ~ 1/4 T, 127 ~ 2/1'], comments: 'Time=500 ms, 1.0 s, 1.35 s), Clk. Determined by [DelayRange_1] and by [TimeClk] =if present)' },
	DelayTime_2: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.01 m, 64 ~ 252 m, 127 ~ 500 m', '0 ~ 0.01 m, 64 ~ 504 m, 127 ~ 1.000 s', '0 ~ 0.01 m, 64 ~ 1.008 s, 127 ~ 2.000 s', '0 ~ 0.01 m, 64 ~ 1.361 s, 127 ~ 2.700 s', '0 ~ 1/64 T, 64 ~ 1/4 T, 127 ~ 2/1'], comments: 'Time=500 ms, 1.0 s, 2.0 s, 2.7 s), Clk. Determined by [DelayRange_2] and by [TimeClk] =if present)' },
	DelayTime_3: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.01 m, 64 ~ 2.68 m, 127 ~ 5.30 m', '0 ~ 0.01 m, 64 ~ 12.7 m, 127 ~ 25.1 m', '0 ~ 0.01 m, 64 ~ 50.7 m, 127 ~ 101 m', '0 ~ 0.01 m, 64 ~ 252 m, 127 ~ 500 m', '0 ~ 0.01 m, 64 ~ 504 m, 127 ~ 1.000 s', '0 ~ 0.01 m, 64 ~ 1.008 s, 127 ~ 2.000 s', '0 ~ 0.01 m, 64 ~ 1.361 s, 127 ~ 2.700 s', '0 ~ 1/64 T, 64 ~ 1/4 T, 127 ~ 2/1'], comments: 'Time=5ms, 25ms, 100ms, 500ms, 1.0s, 2.0s, 2.7s), Clk. Determined by [DelayRange_3] and [TimeClk] =if present)' },
	DigitizerBits: { low: 0, high: 12, def: 11, defin: ['0 ~ 1, 1 ~ 2, 2 ~ 3, 3 ~ 4, 4 ~ 5, 5 ~ 6, 6 ~ 7, 7 ~ 8, 8 ~ 9, 9 ~ 10, 10 ~ 11, 11 ~ 12, 12 ~ Off'], comments: '' },
	DigitizerRate: { low: 0, high: 127, def: 64, defin: ['0 ~ 32.70 Hz, 64 ~ 1.32 kHz, 127 ~ 50.2 kHz'], comments: '' },
	DrumSynthFreq: { low: 0, high: 127, def: 42, defin: ['0 ~ 20 Hz, 64 ~ 127 Hz, 127 ~ 784 Hz'], comments: '' },
	DrumSynthNoiseFlt: { low: 0, high: 127, def: 57, defin: ['0 ~ 10.30 Hz, 64 ~ 415.3 Hz, 127 ~ 15.8 kHz'], comments: '' },
	DrumSynthRatio: { low: 0, high: 127, def: 15, defin: ['0 ~ 1:1, 64 ~ x2.52, 127 ~ x6.26'], comments: '' },
	Dst_1: { mode: 'HR', names: ['1/2', '3/4', '1/2', '3/4', '1/2', '3/4'], width: 17, low: 0, high: 5, def: 0, defin: ['0 ~ Out 1/2, 1 ~ Out 3/4, 2 ~ Fx 1/2, 3 ~ Fx 3/4, 4 ~ Bus 1/2, 5 ~ Bus 3/4'], comments: '' },
	Dst_2: { mode: 'HR', names: ['Out', 'Fx', 'Bus'], width: 17, low: 0, high: 2, def: 0, defin: ['0 ~ Out, 1 ~ Fx, 2 ~ Bus'], comments: '' },
	DxAlgorithm: { low: 0, high: 31, def: 0, defin: ['0 ~ 1, 31 ~ 32'], comments: '' },
	DxFeedback: { low: 0, high: 7, def: 0, defin: ['0 ~ 0, 1 ~ 1, 2 ~ 2, 3 ~ 3, 4 ~ 4, 5 ~ 5, 6 ~ 6, 7 ~ 7'], comments: '' },
	EnvFollowAttack: { low: 0, high: 127, def: 0, defin: ['0 ~ Fast, 1 ~ 0.53m, 64 ~ 23.0m, 127 ~ 1.00s'], comments: '' },
	EnvFollowRelease: { low: 0, high: 127, def: 20, defin: ['0 ~ 10.0m, 20 ~ 24.6m, 64 ~ 177m, 127 ~ 3.00s'], comments: '' },
	EnvLevel: { f: 'adsrL', low: 0, high: 127, def: 0, defin: ['0 ~ 0.0, 126 ~ 63.0, 127 ~ 64.0'], comments: '' },
	EnvNR: { names: ['N', 'R'], width: 10, low: 0, high: 1, def: 0, defin: ['0 ~ Normal, 1 ~ Reset'], comments: '' },
	EnvShape_3: { bmp: 'Curve', w: 20, maskh: 10, names: ['', '', '', ''], low: 0, high: 3, def: 0, defin: ['0 ~ LogExp, 1 ~ LinExp, 2 ~ ExpExp, 3 ~ LinLin'], comments: '' },
	EnvTime: { f: 'adsrT', low: 0, high: 127, def: 0, defin: ['0 ~ 0.5m, 127 ~ 45.0s'], comments: '' },
	EqdB: { low: 64, high: 127, def: 0, defin: ['0 ~ -18.0 dB, 64 ~ 0.0 dB, 127 ~ 18.0 dB'], comments: '' },
	EqHiFreq: { low: 0, high: 2, def: 0, defin: ['0 ~ 6K, 1 ~ 8K, 2 ~ 12K'], comments: '' },
	EqLoFreq: { low: 0, high: 2, def: 0, defin: ['0 ~ 80, 1 ~ 110, 2 ~ 160'], comments: '' },
	EqMidFreq: { low: 0, high: 127, def: 93, defin: ['0 ~ 100 Hz, 64 ~ 910 Hz, 93 ~ 2.48 kHz, 127 ~ 8.00 kHz'], comments: '' },
	EqPeakBandwidth: { low: 0, high: 127, def: 64, defin: ['0 ~ 2.00 Oct, 64 ~ 1.00 Oct, 127 ~ 0.02 Oct'], comments: '' },
	ExpLin_1: { low: 0, high: 1, def: 0, defin: ['0 ~ Exp, 1 ~ Lin'], comments: '' },
	ExpLin_2: { low: 0, high: 2, def: 0, defin: ['0 ~ Exp, 1 ~ Lin, 2 ~ dB'], comments: '' },
	Fade12Mix: { low: 0, high: 127, def: 64, defin: ['0 ~ O1:127, 64 ~ Mute, 127 ~ O2:127'], comments: '' },
	Fade21Mix: { low: 0, high: 127, def: 64, defin: ['0 ~ I1:127, 64 ~ Mute, 127 ~ I2:127'], comments: '' },
	FlangerRate: { low: 0, high: 127, def: 64, defin: ['0 ~ 0.01 Hz, 64 ~ 1.46 Hz, 127 ~ 2.91 Hz'], comments: '' },
	FlipFlopMode: { width: 36, img: 'ModeFF', h: 25, low: 0, high: 1, def: 0, defin: ['0 ~ D type, 1 ~ SR type'], comments: '' },
	FltFreq: { f: 'filterFreq', low: 0, high: 127, def: 75, defin: ['0 ~ 13.75 Hz, 64 ~ 554.4Hz, 75 ~ 1.05 kHz, 127 ~ 21.1 kHz'], comments: '' },
	FltPhaseNotchCount: { low: 0, high: 5, def: 2, defin: ['0 ~ 1, 1 ~ 2, 2 ~ 3, 3 ~ 4, 4 ~ 5, 5 ~ 6'], comments: '' },
	FltPhaseType: { width: 28, low: 0, high: 2, def: 0, defin: ['0 ~ Notch, 1 ~ Peak, 2 ~ Deep'], comments: '' },
	FltSlope_1: { names: ['6', '12'], low: 0, high: 1, def: 1, defin: ['0 ~ 6, 1 ~ 12'], comments: '' },
	FltSlope_2: { names: ['12', '24'], low: 0, high: 1, def: 0, defin: ['0 ~ 12, 1 ~ 24'], comments: '' },
	FmLinTrk: { low: 0, high: 1, def: 0, defin: ['0 ~ Lin, 1 ~ Trk'], comments: '' },
	Freq_1: { f: 'filterFreq1', low: 0, high: 127, def: 64, defin: ['0 ~ 8.1758 Hz, 64 ~ 329.63 Hz, 127 ~ 12.55 kHz'], comments: '' },
	Freq_2: { f: 'filterFreq2', low: 0, high: 127, def: 64, defin: ['0 ~ 100.0 Hz, 64 ~ 1.29 kHz, 127 ~ 16.0 kHz'], comments: '' },
	Freq_3: { low: 0, high: 127, def: 60, defin: ['0 ~20.00 Hz , 60 ~ 470.5 Hz, 64 ~ 580.8 Hz, 127 ~ 16.0 kHz'], comments: '' },
	FreqCoarse: { f: 'OscFreq', low: 0, high: 127, def: 64, defin: ['0 ~ -64, 64 ~ 0, 127 ~ +63', '0 ~ 8.1756 Hz, 64 ~ 329.63 Hz, 127 ~ 12.55 kHz', '0 ~ x0.0248, 64 ~ x1.0000, 127 ~ x38.055', '0 ~ 0 Hz, 64 ~ 1:1, 127 ~ 64:1'], comments: 'Modes : Semi, Freq, Fac and Part' },
	FreqFine: { f: 'OscFreq', low: 0, high: 127, def: 64, defin: ['0 ~ -50.0, 64 ~ +0.0, 127 ~ +49.2'], comments: 'In cents' },
	FreqMode_2: { width: 24, names: ['Semi', 'Freq', 'Fac'], f: 'OscFreq', low: 0, high: 2, def: 0, defin: ['0 ~ Semi, 1 ~ Freq, 2 ~ Fac'], comments: '' },
	FreqMode_3: { width: 24, names: ['Semi', 'Freq', 'Fac', 'Part'], f: 'OscFreq', low: 0, high: 3, def: 0, defin: ['0 ~ Semi, 1 ~ Freq, 2 ~ Fac, 3 ~ Part'], comments: '' },
	FreqShiftFreq: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.000 Hz, 64 ~ 1.12 Hz, 127 ~ 8.78 Hz', '0 ~ 0.000 Hz, 64 ~ 12.5 Hz, 127 ~ 97.6 Hz', '0 ~ 0.000 Hz, 64 ~ 201 Hz, 127 ~ 1568 Hz'], comments: 'Sub, Lo, Hi. Determined by [FreqShiftRange]' },
	FreqShiftRange: { low: 0, high: 2, def: 0, defin: ['0 ~ Sub, 1 ~ Lo, 2 ~ Hi'], comments: 'Determines [FreqShiftFreq] range' },
	GateMode: { width: 36, img: 'ModeGate', h: -21, low: 0, high: 5, def: 0, defin: ['0 ~ AND, 1 ~ NAND, 2 ~ OR, 3 ~ NOR, 4 ~ XOR, 5 ~ XNOR'], comments: '' },
	GlideTime: { low: 0, high: 127, def: 64, defin: ['0 ~ 0.2 m, 64 ~ 511 m, 127 ~ 22.4s', '0 ~ 0.2 ms/Oct, 64 ~ 480 ms/Oct, 127 ~ 23.5 s/Oct'], comments: 'Log, Lin. Determined by the Shape parameter =[LogLin])' },
	HpLpSlopeMode: { low: 0, high: 5, def: 0, defin: ['0 ~ 6dB, 1 ~ 12dB, 2 ~ 18dB, 3 ~ 24dB, 4 ~ 30dB, 5 ~ 36dB'], comments: '' },
	InternalMaster: { low: 0, high: 1, def: 0, defin: ['0 ~ Internal, 1 ~ Master'], comments: '' },
	Kbt_1: { names: ['Off', 'On'], low: 0, high: 1, def: 1, defin: ['0 ~ Off, 1 ~ On'], comments: '' },
	Kbt_4: { width: 24, names: ['Off', '25%', '50%', '75%', '100%'], low: 0, high: 4, def: 0, defin: ['0 ~ Off, 1 ~ 25%, 2 ~ 50%, 3 ~ 75%, 4 ~ 100%'], comments: '' },
	KeyQuantCapture: { width: 32, low: 0, high: 1, def: 0, defin: ['0 ~ Closest, 1 ~ Evenly'], comments: '' },
	LevAmpGain: { low: 0, high: 127, def: 64, defin: ['0 ~ x0.00, 64 ~ x1.00, 127 ~ x4.00'], comments: '' },
	LevBipUni: { low: 0, high: 127, def: 0, defin: ['0 ~ -64, 64 ~ 0, 127 ~ 64', '0 ~ 0, 64 ~ 50, 127 ~ 100'], comments: 'Bip, Uni. Determined by [BipUni] setting' },
	Level_100: { low: 0, high: 127, def: 0, defin: ['0 ~ 0, 64 ~ 50, 127 ~ 100'], comments: 'Can be used to denote a =not necessarily linear) 0 .. 100 range or a percentage' },
	Level_200: { low: 0, high: 127, def: 0, defin: ['0 ~ 0, 64 ~ 100, 127 ~ 200'], comments: 'Percentage' },
	LevModAmRm: { low: 0, high: 127, def: 64, defin: ['0 ~ None, 64 ~ AM, 127 ~ RM'], comments: '' },
	LevScaledB: { low: 0, high: 127, def: 64, defin: ['0 ~ -8.0 dB, 64 ~ 0.0 dB, 127 ~ 8.0 dB'], comments: '' },
	LfoA_Waveform: { mode: 'HR', names: ['', '', '', '', '', ''], width: 17, bmp: 'LfoAWave', low: 0, high: 5, def: 0, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Aqr, 4 ~ RndStep, 5 ~ Rnd'], comments: '' },
	LfoB_Waveform: { mode: 'HR', names: ['', '', '', ''], width: 17, bmp: 'LfoBWave', low: 0, high: 3, def: 0, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Square'], comments: '' },
	LfoRange_3: { width: 40, f: 'rateLo', low: 0, high: 3, def: 1, defin: ['0 ~ Sub, 1 ~ Lo, 2 ~ Hi, 3 ~ BPM'], comments: 'Determines [LfoRate_3]' },
	LfoRange_4: { width: 40, f: 'rateLo', low: 0, high: 4, def: 0, defin: ['0 ~ Rate Sub, 1 ~ Rate Lo, 2 ~ Rate Hi, 3 ~ BPM, 4 ~ Clock'], comments: 'Determines [LfoRate_4]' },
	LfoRate_3: { f: 'rateLo', low: 0, high: 127, def: 1, defin: ['0 ~ 699s, 127 ~ 5.46s', '1 ~ 62.9s, 127 ~ 24.4 Hz', '2 ~ 0.26 Hz, 127 ~ 392 Hz', '3 ~ 24, 127 ~ 214'], comments: 'Sub, Lo, Hi, BPM =BPM is the same as for RateBpm). Determined by [LfoRange_3]' },
	LfoRate_4: { f: 'rateLo', low: 0, high: 127, def: 1, defin: ['0 ~ 699s, 127 ~ 5.46s', '1 ~ 62.9s, 127 ~ 24.4 Hz', '2 ~ 0.26 Hz, 127 ~ 392 Hz', '3 ~ 24, 127 ~ 214', '4 ~ 64/1, 64 ~ 1/4D, 127 ~ 1/64T'], comments: 'Sub, Lo, Hi, BPM, Clock =BPM is the same as for RateBpm). Determined by [LfoRange_4]' },
	LfoShpA__Waveform: { mode: 'HR', names: ['', '', '', '', '', ''], width: 17, bmp: 'LfoShpAWave', low: 0, high: 5, def: 0, defin: ['0 ~ Sine, 1 ~ CosBell, 2 ~ TriBell, 3 ~ Saw2Tri, 4 ~ Sqr2Tri, 5 ~ Sqr'], comments: '' },
	LfoShpAPW: { low: 0, high: 127, def: 0, defin: ['0 ~ 1%, 64 ~ 50%, 127 ~ 98%'], comments: '' },
	LfoWaveform_1: { img: 'ModeLfoC', low: 0, high: 7, def: 0, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Square, 4 ~ RndStep, 5 ~ Rnd, 6 ~ RndPulse, 7 ~ RndRoundedPulse'], comments: '' },
	LinDB: { low: 0, high: 1, def: 0, defin: ['0 ~ Lin, 1 ~ dB'], comments: '' },
	LogicDelayMode: { width: 20, img: 'ModeDelay', h: -21, low: 0, high: 2, def: 0, defin: ['0 ~ Positive edge delay, 1 ~ Negative edge delay, 2 ~ Cycle delay'], comments: '' },
	LogicRange: { low: 0, high: 2, def: 0, defin: ['0 ~ Sub, 1 ~ Lo, 2 ~ Hi'], comments: 'Determines [LogicTime]' },
	LogicTime: { low: 0, high: 127, def: 1, defin: ['0 ~ 0.10m, 127 ~ 1.00s', '0 ~ 1.04m, 127 ~ 10.0s', '0 ~ 10.4m, 127 ~ 100.0s'], comments: 'Sub, Lo, Hi. Determined by [LogicRange]' },
	LogLin: { low: 0, high: 1, def: 0, defin: ['0 ~ Log, 1 ~ Lin'], comments: '' },
	LoopOnce: { bmp: 'SeqLp', w: 19, maskh: 11, names: ['', ''], low: 0, high: 1, def: 1, defin: ['0 ~ Once, 1 ~ Loop'], comments: '' },
	LpBpHp: { names: ['LP', 'BP', 'HP'], low: 0, high: 2, def: 0, defin: ['0 ~ LP, 1 ~ BP, 2 ~ HP'], comments: '' },
	LpBpHp2: { names: ['LP', 'BP', 'HP'], low: 0, high: 2, def: 0, defin: ['0 ~ LP, 1 ~ BP, 2 ~ HP'], comments: '' },
	LpBpHpBr: { mode: 'VR', names: ['LP', 'BP', 'HP', 'BR'], low: 0, high: 3, def: 0, defin: ['0 ~ LP, 1 ~ BP, 2 ~ HP, 3 ~ BR'], comments: '' },
	MidiCh_16: { low: 0, high: 16, def: 0, defin: ['0 ~ ch1, 1 ~ ch 2, 2 ~ ch3, 3 ~ ch4, 4 ~ ch5, 5 ~ ch6, 6 ~ ch7, 7 ~ ch8, 8 ~ ch9, 9 ~ ch10, 10 ~ ch11, 11 ~ ch12, 12 ~ ch13, 13 ~ ch14, 14 ~ ch15, 15 ~ ch16, 16 ~ This'], comments: '' },
	MidiCh_17: { low: 0, high: 17, def: 0, defin: ['0 ~ ch1, 1 ~ ch2, 2 ~ ch3, 3 ~ ch4, 4 ~ ch5, 5 ~ ch6, 6 ~ ch7, 7 ~ ch8, 8 ~ ch9, 9 ~ ch10, 10 ~ ch11, 11 ~ ch12, 12 ~ ch13, 13 ~ ch14, 14 ~ ch15, 15 ~ ch16, 16 ~ This, 17 ~ keyb'], comments: '' },
	MidiCh_20: { low: 0, high: 20, def: 0, defin: ['0 ~ ch1, 1 ~ ch 2, 2 ~ ch3, 3 ~ ch4, 4 ~ ch5, 5 ~ ch6, 6 ~ ch7, 7 ~ ch8, 8 ~ ch9, 9 ~ ch10, 10 ~ ch11, 11 ~ ch12, 12 ~ ch13, 13 ~ ch14, 14 ~ ch15, 15 ~ ch16, 16 ~ This, 17 ~ Slot A, 18 ~ Slot B, 19 ~ Slot C, 20 ~ Slot D'], comments: '' },
	MidiData: { low: 0, high: 127, def: 0, defin: ['0 ~ 0, 127 ~ 127'], comments: 'One to one mapping with MIDI data values' },
	MixInvert: { names: ['Inv'], width: 17, low: 0, high: 1, def: 0, defin: ['0 ~ Normal, 1 ~ Inverted'], comments: '' },
	MixLevel: { low: 0, high: 127, def: 0, defin: ['0 ~ 0, 64 ~ 50, 127 ~ 100', '0 ~ 0, 64 ~ 50, 127 ~ 100', '0 ~ -{00}, 64 ~ -17.6, 127 ~ -0'], comments: 'Lin, Exp, dB' },
	ModAmtInvert: { low: 0, high: 1, def: 0, defin: ['0 ~ m, 1 ~ 1-m'], comments: '' },
	MonoKeyMode: { mode: 'HR', names: ['Last', 'Lo', 'Hi'], width: 23, low: 0, high: 2, def: 0, defin: ['0 ~ Last, 1 ~ Lo, 2 ~ Hi'], comments: '' },
	NoiseColor: { low: 0, high: 127, def: 0, defin: ['0 ~ 0 =White), 64 ~ 50, 127 ~ 100 =Colored)'], comments: '' },
	NoiseGateAttack: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.2 m, 64 ~ 28.0 m, 127 ~ 100 m'], comments: '' },
	NoiseGateRelease: { low: 0, high: 127, def: 64, defin: ['0 ~ 0.50 m, 64 ~ 86.4 m, 127 ~ 1.00 s'], comments: '' },
	NoteQuantNotes: { low: 0, high: 127, def: 0, defin: ['0 ~ Off, 1 ~ 1, 127 ~ 127'], comments: '' },
	NoteRange: { low: 0, high: 127, def: 0, defin: ['0 ~ {+-}0, 1 ~ {+-}0.5, 64 ~ {+-}32, 126 ~ {+-}63.0, 127 ~ {+-}64.0'], comments: '' },
	NoteZoneThru: { low: 0, high: 1, def: 0, defin: ['0 ~ Notes Only, 1 ~ Note+Ctrls'], comments: '' },
	OffOn: { names: ['Ch#'], low: 0, high: 1, def: 0, defin: ['0 ~ Off, 1 ~ On'], comments: '' },
	OffOn2: { names: ['Off', 'On'], low: 0, high: 1, def: 0, defin: ['0 ~ Off, 1 ~ On'], comments: 'Alternative for punch etc' },
	OffOnBlank: { names: [''], width: 12, low: 0, high: 1, def: 0, defin: ['0 ~ Off, 1 ~ On'], comments: '' },
	OpAmod: { low: 0, high: 7, def: 0, defin: ['0 ~ 0, 7 ~ 7'], comments: '' },
	OpBrPpoint: { low: 0, high: 99, def: 0, defin: ['0 ~ 0, 99 ~ 99'], comments: '' },
	OpDepth: { low: 0, high: 99, def: 0, defin: ['0 ~ 0, 99 ~ 99'], comments: '' },
	OpDepthMode: { low: 0, high: 3, def: 0, defin: ['0 ~ 0, 3 ~ 3'], comments: '' },
	OpFreqCoarse: { low: 0, high: 31, def: 0, defin: ['0 ~ 0, 31 ~ 31'], comments: '' },
	OpFreqDetune: { low: 0, high: 14, def: 0, defin: ['0 ~ -7, 7 ~ 0, 14 ~ 7'], comments: '' },
	OpFreqFine: { low: 0, high: 99, def: 0, defin: ['0 ~ 0, 99 ~ 99'], comments: '' },
	OpLevel: { low: 0, high: 99, def: 0, defin: ['0 ~ 0, 99 ~ 99'], comments: '' },
	OpRateScale: { low: 0, high: 7, def: 0, defin: ['0 ~ 0, 7 ~ 7'], comments: '' },
	OpTime: { low: 0, high: 99, def: 0, defin: ['0 ~ 0, 99 ~ 99'], comments: '' },
	OpVel: { low: 0, high: 7, def: 0, defin: ['0 ~ 0, 7 ~ 7'], comments: '' },
	OscA_Waveform: { mode: 'HR', names: ['', '', '', '', '', ''], width: 17, bmp: 'OscAWave', low: 0, high: 5, def: 2, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Square, 4 ~ Pulse 25%, 5 ~ Pulse 10%'], comments: '' },
	OscBWaveform: { mode: 'HR', names: ['', '', '', '', ''], width: 17, bmp: 'OscBWave', low: 0, high: 4, def: 0, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Pulse, 4 ~ DualSaw'], comments: '' },
	OscShpA_Waveform: { mode: 'HR', names: ['', '', '', '', '', ''], width: 17, bmp: 'OscShpAWave', low: 0, high: 5, def: 0, defin: ['0 ~ Sine1, 1 ~ Sine2, 2 ~ Sine3, 3 ~ Sine4, 4 ~ TriSaw, 5 ~ SymPulse'], comments: '' },
	OscWaveform_1: { low: 0, high: 1, def: 0, defin: ['0 ~ Sine, 1 ~ Tri'], comments: '' },
	OscWaveform_2: { img: 'ModeWave2', low: 0, high: 5, def: 0, defin: ['0 ~ Sine, 1 ~ Tri, 2 ~ Saw, 3 ~ Square, 4 ~ Pulse 25%, 5 ~ Pulse 10%'], comments: '' },
	OscWaveform_3: { img: 'ModeShpB', low: 0, high: 7, def: 0, defin: ['0 ~ Sine1, 1 ~ Sine2, 2 ~ Sine3, 4 ~ TriSaw, 5 ~ DoubleSaw, 6 ~ Pulse, 7 ~ SymPuls'], comments: '' },
	OutTypeLfo: { width: 14, bmp: 'OutputMode', low: 0, high: 5, def: 4, defin: ['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv, 4 ~ Bip, 5 ~ BipInv'], comments: '' },
	OverdriveType: { width: 26, low: 0, high: 3, def: 0, defin: ['0 ~ Soft, 1 ~ Hard, 2 ~ Fat, 3 ~ Heavy'], comments: '' },
	Pad_1: { width: 26, low: 0, high: 1, def: 0, defin: ['0 ~ 0 dB, 1 ~ +6 dB'], comments: '' },
	Pad_2: { width: 26, low: 0, high: 1, def: 0, defin: ['0 ~ 0 dB, 1 ~ -6 dB'], comments: '' },
	Pad_3: { width: 26, low: 0, high: 2, def: 0, defin: ['0 ~ 0 dB, 1 ~ -6 dB, 2 ~ -12 dB'], comments: '' },
	Pad_4: { width: 26, low: 0, high: 3, def: 1, defin: ['0 ~ -12 dB, 1 ~ -6 dB, 2 ~ 0 dB,3 ~ +6 dB'], comments: '' },
	PartialRange: { low: 0, high: 127, def: 0, defin: ['0 ~ {+-}0, 1 ~ {+-}0, 64 ~ {+-}32, 65 ~ {+-}32*, 126 ~ {+-}63*, 126 ~ {+-}63*'], comments: '* clipped at {+-}32 and the lowest bit is not effective' },
	Phase: { f: 'lfoP', low: 0, high: 127, def: 0, defin: ['0 ~ 0, 64 ~ 180, 127 ~ 357'], comments: 'In degrees, 360 degrees in a full circle' },
	PhaserFreq: { low: 0, high: 127, def: 64, defin: ['0 ~ 0.05 Hz, 64 ~ 2.98 Hz, 127 ~ 11.6 Hz'], comments: '' },
	PhaserType: { low: 0, high: 1, def: 0, defin: ['0 ~ Type I, 1 ~ Type II'], comments: '' },
	PolyMono: { width: 28, low: 0, high: 1, def: 0, defin: ['0 ~ Poly, 1 ~ Mono'], comments: '' },
	PosNegInv: { width: 14, bmp: 'OutputMode', low: 0, high: 3, def: 0, defin: ['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv'], comments: '' },
	PosNegInvBip: { width: 14, bmp: 'OutputMode', low: 0, high: 4, def: 0, defin: ['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv, 4 ~ Bip'], comments: '' },
	PosNegInvBipInv: { width: 14, bmp: 'OutputMode', low: 0, high: 5, def: 0, defin: ['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv, 4 ~ Bip, 5 ~ BipInv'], comments: '' },
	PShiftCoarse: { low: 0, high: 127, def: 64, defin: ['1 ~ -16.0, 64 ~ +0.0, 127 ~ +15.8'], comments: 'Semitones' },
	PShiftFine: { low: 0, high: 127, def: 64, defin: ['1 ~ -50, 64 ~ +0, 127 ~ +49.2'], comments: 'Cents ?' },
	PulseMode: { width: 20, img: 'ModePulse', h: -21, low: 0, high: 1, def: 0, defin: ['0 ~ Positive edge trigger, 1 ~ Negative edge trigger'], comments: '' },
	PW: { low: 0, high: 127, def: 0, defin: ['0 ~ 50%, 127 ~ 99%'], comments: '' },
	RandomAStepProb: { low: 0, high: 3, def: 0, defin: ['0 ~ 25%, 1 ~ 50%, 2 ~ 75%, 3 ~ 100%'], comments: '' },
	Range_128: { low: 0, high: 127, def: 0, defin: ['0 ~ 1, 127 ~ 128'], comments: 'Mapping of origin zero to origin one' },
	Range_64: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.0, 1 ~ 0.5, 64 ~ 32.0, 126 ~ 63.0, 127 ~ 64.0'], comments: '' },
	RangeBip_128: { low: 0, high: 127, def: 64, defin: ['0 ~ -64, 64 ~ 0, 126 ~ 62, 127 ~ 64'], comments: '' },
	RateBpm: { f: 'rateBPM', low: 0, high: 127, def: 64, defin: ['0 ~ 24 BPM, 64 ~ 120 BPM, 127 ~ 214 BPM'], comments: '' },
	RatioFixed: { names: ['Ratio', 'Fixed'], low: 0, high: 1, def: 0, defin: ['0 ~ Ratio, 1 ~ Fixed'], comments: '' },
	RectMode: { mode: 'HR', names: ['', '', '', ''], width: 22, bmp: 'Rect', low: 0, high: 3, def: 0, defin: ['0 ~ Half wave positive, 1 ~ Half wave negative, 2 ~ Full wave positive, 3 ~ Full wave negative'], comments: '' },
	Res_1: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.50, 64 ~ 1.67, 127 ~ 50'], comments: '' },
	ReverbTime: { low: 0, high: 127, def: 0, defin: ['0 ~ 0.0ms, 127 ~ 3.000s', '0 ~ 0.0ms, 127 ~ 6.000s', '0 ~ 0.0ms, 127 ~ 9.000s', '0 ~ 0.0ms, 127 ~ 12.00s'], comments: 'Small, Medium, Large, Hall. Determined by [RoomType]' },
	Rnd_1: { low: 0, high: 1, def: 0, defin: ['0 ~ Rnd1, 1 ~ Rnd2'], comments: '' },
	RndEdge: { low: 0, high: 4, def: 0, defin: ['0 ~ 0%, 1 ~ 25%, 2 ~ 50%, 3 ~ 75%, 4 ~ 100%'], comments: '' },
	RndStepPulse: { low: 0, high: 1, def: 0, defin: ['0 ~ Step, 1 ~ Pulse'], comments: '' },
	RoomType: { low: 0, high: 3, def: 0, defin: ['0 ~ Small, 1 ~ Medium, 2 ~ Large, 3 ~ Hall'], comments: 'Determines ranges for [ReverbTime]' },
	SaturateCurve: { names: ['1', '2', '3', '4'], low: 0, high: 3, def: 0, defin: ['0 ~ 1, 1 ~ 2, 2 ~ 3, 3 ~ 4'], comments: '' },
	ScratchDelay: { low: 0, high: 3, def: 2, defin: ['0 ~ 12.5m, 1 ~ 25m, 2 ~ 50m, 3 ~ 100m'], comments: 'mili seconds' },
	ScratchRatio: { low: 0, high: 127, def: 80, defin: ['0 ~ -x4.00, 64 ~ x0, 80 ~ x1.00, 127 ~ x4.00'], comments: 'negative speeds mean backwards playing' },
	SeqCtrlXFade: { low: 0, high: 3, def: 0, defin: ['0 ~ Off, 1 ~ 25%, 2 ~ 50%, 3 ~ 100%'], comments: '' },
	SeqLen: { low: 0, high: 15, def: 0, defin: ['0 ~ 1, 1 ~ 2, 2 ~ 3, 3 ~ 4, 4 ~ 5, 5 ~ 6, 6 ~ 7, 7 ~ 8, 8 ~ 9, 9 ~ 10, 10 ~ 11, 11 ~ 12, 12 ~ 13, 13 ~ 14, 14 ~ 15, 15 ~ 16'], comments: '' },
	ShpExpCurve: { names: ['x2', 'x3', 'x4', 'x5'], low: 0, high: 3, def: 0, defin: ['0 ~ x2, 1 ~ x3, 2 ~ x4, 3 ~ x5'], comments: '' },
	ShpStaticMode: { mode: 'HR', names: ['', '', '', ''], width: 22, bmp: 'ShpStatic', low: 0, high: 3, def: 1, defin: ['0 ~ Inv x3, 1 ~ Inv x2, 2 ~ x2, 3 ~ x3'], comments: '' },
	Source_1: { mode: 'HR', names: ['1/2', '3/4'], width: 17, low: 0, high: 1, def: 0, defin: ['0 ~ FX 1/2, 1 ~ FX 3/4'], comments: '' },
	Source_2: { mode: 'HR', names: ['1/2', '3/4', '1/2', '3/4'], width: 17, low: 0, high: 3, def: 0, defin: ['0 ~ In 1/2, 1 ~ In 3/4, 2 ~ Bus 1/2, 3 ~ Bus 3/4'], comments: '' },
	Source_3: { mode: 'HR', names: ['In', 'Bus'], width: 19, low: 0, high: 1, def: 0, defin: ['0 ~ In, 1 ~ Bus'], comments: '' },
	SustainMode_1: { low: 0, high: 1, def: 1, defin: ['0 ~ L1, 1 ~ L2'], comments: '' },
	SustainMode_2: { low: 0, high: 3, def: 2, defin: ['0 ~ L1, 1 ~ L2, 2 ~ L3, 3 ~ Trg'], comments: '' },
	Sw_1: { names: ['1', '2'], width: 44, low: 0, high: 1, def: 0, defin: ['0 ~ sw1, 1 ~ sw2'], comments: '' },
	sw_2: { names: ['1', '2', '3', '4'], width: 42, low: 0, high: 3, def: 0, defin: ['0 ~ sw1, 1 ~ sw2, 2 ~ sw3, 3 ~ sw4'], comments: '' },
	sw_3: { names: ['1', '2', '3', '4', '5', '6', '7', '8'], rows: 2, width: 42, low: 0, high: 7, def: 0, defin: ['0 ~ sw1, 1 ~ sw2, 2 ~ sw3, 3 ~ sw4, 4 ~ sw5, 5 ~ sw6, 6 ~ sw7, 7 ~ sw8'], comments: '' },
	Threshold_127: { low: 0, high: 127, def: 0, defin: ['0 ~ -{00}, 64 ~ -6.0 dB, 127 ~ -0 dB'], comments: '' },
	Threshold_42: { low: 0, high: 42, def: 18, defin: ['0 ~ -30 dB, 18 ~ -12 dB, 42 ~ Off'], comments: '' },
	TimeClk: { width: 40, low: 0, high: 1, def: 0, defin: ['0 ~ Time, 1 ~ Clk'], comments: '' },
	TrigGate: { names: ['T', 'G'], width: 11, low: 0, high: 1, def: 0, defin: ['0 ~ Trig, 1 ~ Gate'], comments: '' },
	ValSwVal: { low: 0, high: 63, def: 0, defin: ['0 ~ 0, 62 ~ 62, 63 ~ 64'], comments: '' },
	VocoderBand: { low: 0, high: 16, def: 0, defin: ['0 ~ Off, 1 ~ 1, 2 ~ 2, 3 ~ 3, 4 ~ 4, 5 ~ 5, 6 ~ 6, 7 ~ 7, 8 ~ 8, 9 ~ 9, 10 ~ 10, 11 ~ 11, 12 ~ 12, 13 ~ 13, 14 ~ 14, 15 ~ 15, 16 ~ 16'], comments: '' },
	Vowel: { low: 0, high: 8, def: 0, defin: ['0 ~ A, 1 ~ E, 2 ~ I, 3 ~ O, 4 ~ U, 5 ~ Y, 6 ~ AA, 7 ~ AE, 8 ~ OE'], comments: '' },
};

export function getParam(name: string): ParamDefinition | undefined {
	return parammap[name];
}

export function adsrT(i: number): string {
	const t = [
		0.5, 0.6, 0.7, 0.9, 1.1, 1.3, 1.5, 1.8, 2.1, 2.5, 3.0, 3.5, 4.0, 4.7, 5.5, 6.3, 7.3, 8.4, 9.7, 11.1, 12.7, 14.5, 16.5, 18.7, 21.2, 24.0, 27.1, 30.6,
		34.4, 38.7, 43.4, 48.6, 54.3, 60.6, 67.6, 75.2, 83.6, 92.8, 103, 114, 126, 139, 153, 169, 186, 204, 224, 246, 269, 295, 322, 352, 384, 419, 456, 496,
		540, 586, 636, 690, 748, 810, 876, 947, 1020, 1100, 1190, 1280, 1380, 1490, 1600, 1720, 1850, 1990, 2130, 2280, 2450, 2620, 2810, 3000, 3210, 3430,
		3660, 3910, 4170, 4450, 4740, 5050, 5370, 5720, 6080, 6470, 6870, 7300, 7750, 8220, 8720, 9250, 9800, 10400, 11000, 11600, 12300, 13000, 13800, 14600,
		15400, 16200, 17100, 18100, 19100, 20100, 21200, 22400, 23500, 24800, 26100, 27500, 28900, 30400, 32000, 33600, 35300, 37100, 38900, 40900, 42900,
		45000,
	][Math.floor(i)];
	return t < 1000 ? t + 'm' : t / 1000 + 's';
}

export function adsrL(i: number): number {
	let o = Math.floor(i) / 2;
	if (o > 63) o = 64;
	return o;
}

export function lfoP(i: number): number {
	return Math.round(i < 127 ? i * 2.8125 : 359);
}

export function rateBPM(i: number): string {
	i = Math.floor(i);
	return ((i < 32 && 24 + i * 2) || (i > 95 && -40 + i * 2) || 56 + i) + 'BPM';
}

const _clk = [
	'64/1',
	'48/1',
	'32/1',
	'24/1',
	'16/1',
	'12/1',
	'8/1',
	'6/1',
	'4/1',
	'3/1',
	'2/1',
	'1/1D',
	'1/1',
	'1/2D',
	'1/1T',
	'1/2',
	'1/4D',
	'1/2T',
	'1/4',
	'1/8D',
	'1/4T',
	'1/8',
	'1/16D',
	'1/8T',
	'1/16',
	'1/32D',
	'1/16T',
	'1/32',
	'1/64D',
	'1/32T',
	'1/64',
	'1/64T',
];


function numberFormat(value: number) {
	return (Math.round(value * 100) / 100).toFixed(1);
}

export function rateLo(i: number, con: unknown, tw: unknown): string | undefined {
	if (!tw) return;
	i = (con as Record<string, { l: number }>)[(tw as { ca: number[] }).ca[0]].l;
	const bf = [{ b: 0.09259, f: 1.06733 }, { b: 0.64, f: 1.05946309436 }, { b: 10.3, f: 1.05946309436 }, 0, 1][
		(con as Record<string, { l: number }>)[(tw as { ca: number[] }).ca[1]].l
	];
	if (bf == 0) return rateBPM(i).slice(0, -3);
	if (bf == 1) return _clk[i >> 2];
	const r = (bf as { b: number; f: number }).b / Math.pow((bf as { b: number; f: number }).f, 64 - Math.floor(i));
	const sec = numberFormat(1 / r);
	// sec.toFixed(1);
	return (r < 0.1 && sec + 's') || r.toFixed((r < 10 && 2) || 1) + 'Hz';
}

export function OscFreq(i: number, con: unknown, tw: unknown): string | undefined {
	if (!tw) return;
	const c = Math.floor((con as Record<string, { l: number }>)[(tw as { ca: number[] }).ca[0]].l);
	const f = Math.floor((con as Record<string, { l: number }>)[(tw as { ca: number[] }).ca[1]].l);
	const m = (con as Record<string, { l: number }>)[(tw as { ca: number[] }).ca[2]].l;
	let r: number;
	switch (m) {
		case 0:
			return (c > 63 ? '+' : '') + (c - 64).toFixed(0) + '\xA0\xA0\xA0' + (f > 63 ? '+' : '') + (((f - 64) * 1) / 1.28).toFixed(0);
		case 1:
			r = 339.134 / Math.pow(1.05946309436, 64 - (c - 0.5 + ((f - 63) * 1) / 128));
			return r < 1000 ? r.toFixed((r < 100 && 3) || 2) + 'Hz' : (r / 1000).toFixed((r < 10000 && 3) || 2) + 'kHz';
		case 2:
			r = 1.0288383386318507 / Math.pow(1.05946309436, 64 - (c - 0.5 + ((f - 63) * 1) / 128));
			return 'x' + r.toFixed((r < 10 && 6) || 5);
		case 3:
			return (c > 63 ? c - 63 + ':1' : '1:' + Math.abs(c - 65)) + '\xA0\xA0\xA0' + (f > 63 ? '+' : '') + (((f - 64) * 1) / 1.28).toFixed(0);
	}
}

export function filterFreq(i: number): string {
	const r = 554.4 / Math.pow(1.05946309436, 64 - i);
	return r < 1000 ? r.toFixed((r < 100 && 3) || 2) + 'Hz' : (r / 1000).toFixed((r < 10000 && 3) || 2) + 'kHz';
}

export function filterFreq2(i: number): string {
	const r = 1290 / Math.pow(1 + 0.05946309436 / 1.465, 64 - i);
	return r < 1000 ? r.toFixed((r < 100 && 3) || 2) + 'Hz' : (r / 1000).toFixed((r < 10000 && 3) || 2) + 'kHz';
}

export function filterFreq1(i: number): string {
	const r = 329.63 / Math.pow(1.05946309436, 64 - i);
	return r < 1000 ? r.toFixed((r < 100 && 3) || 2) + 'Hz' : (r / 1000).toFixed((r < 10000 && 3) || 2) + 'kHz';
}
