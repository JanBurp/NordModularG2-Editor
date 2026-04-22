<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: 'graph' | 'graphenv'
  x: number
  y: number
  w: number
  h: number
  f?: string
  lv?: number[]  // Parameter values array
  moduleId?: number  // Module type ID for looking up parameter definitions
}>()

// Generate a unique clip path ID based on position
const clipId = computed(() => `graph-clip-${props.x}-${props.y}`)

// Helper to get parameter value with default
const getVal = (index: number, defaultVal: number = 64): number => {
  if (props.lv && props.lv.length > index) {
    return props.lv[index]
  }
  return defaultVal
}

// Normalize value from 0-127 to 0-1
const norm = (val: number): number => val / 127

// Determine graph shape based on function type
const graphPath = computed(() => {
  const { x, y, w, h, f } = props
  
  // Filter & EQ graphs (graphs without 'f' property but with filter-related parameters)
  // Look up module definition to get correct parameter indices
  if (!f && props.type === 'graph' && props.moduleId !== undefined) {
    const modDef = typeof window !== 'undefined' && (window as any).modules?.getById 
      ? (window as any).modules.getById(props.moduleId) 
      : null
    
    if (modDef?.params) {
      // Find parameter indices by type/name
      const params = modDef.params
      const paramCount = params.length
      
      // Look for filter-specific parameters
      const freqIdx = params.findIndex((p: any) => 
        p.type?.includes('Freq') || p.name?.includes('Freq'))
      const resIdx = params.findIndex((p: any) => 
        p.type?.includes('Res') || p.name?.includes('Res'))
      const typeIdx = params.findIndex((p: any) => 
        p.type?.includes('FilterType') || p.type?.includes('LpBpHp'))
      
      // Check for EQ parameters (EqdB type parameters indicate EQ module)
      const eqIndices = params.map((p: any, i: number) => 
        p.type === 'EqdB' || p.name?.includes('Slope') || p.name?.includes('Gain') ? i : -1
      ).filter((i: number) => i >= 0)
      
      const isEQ = eqIndices.length >= 2
      
      const midY = y + h / 2
      
      if (isEQ) {
        // Multi-band EQ - draw EQ curve
        // Get gain values for each EQ band
        const gains = eqIndices.slice(0, 3).map((idx: number) => {
          const val = norm(getVal(idx, 64))  // EqdB defaults to 64 (0dB)
          return (val - 0.5) * 2  // -1 to 1 range
        })
        
        // EQ positions (left, center, right)
        const positions = [
          x + w * 0.2,
          x + w * 0.5,
          x + w * 0.8
        ].slice(0, gains.length)
        
        if (gains.length === 2) {
          // 2-band EQ (shelves)
          const loY = midY - gains[0] * h * 0.4
          const hiY = midY - gains[1] * h * 0.4
          return `M${x},${midY} Q${x + w * 0.1},${midY} ${positions[0]},${loY} 
                  L${positions[1]},${hiY} Q${x + w * 0.9},${midY} ${x + w},${midY}`
        } else if (gains.length >= 3) {
          // 3-band EQ with mid control
          const loY = midY - gains[0] * h * 0.4
          const midYPos = midY - gains[1] * h * 0.4
          const hiY = midY - gains[2] * h * 0.4
          return `M${x},${midY} Q${x + w * 0.1},${midY} ${positions[0]},${loY}
                  Q${x + w * 0.35},${midYPos} ${positions[1]},${midYPos}
                  Q${x + w * 0.65},${midYPos} ${positions[2]},${hiY}
                  Q${x + w * 0.9},${midY} ${x + w},${midY}`
        }
      } else if (freqIdx >= 0) {
        // Single filter with frequency control
        const freq = norm(getVal(freqIdx, 75))
        const cutoffX = x + w * (0.1 + freq * 0.8)
        
        // Get resonance if available
        let resBoost = 0
        if (resIdx >= 0) {
          const res = norm(getVal(resIdx, 0))
          resBoost = res * h * 0.25
        }
        
        // Get filter type
        let filterType = 0  // Default to LP
        if (typeIdx >= 0) {
          filterType = getVal(typeIdx, 0)
        }
        
        if (filterType === 0) {
          // Low Pass
          const passY = y + h * 0.2
          const stopY = y + h * 0.8
          const peakY = passY + resBoost
          return `M${x},${passY} L${cutoffX - w * 0.08},${passY}
                  Q${cutoffX},${peakY} ${cutoffX + w * 0.03},${peakY + resBoost * 0.3}
                  Q${cutoffX + w * 0.12},${stopY} ${x + w},${stopY}`
        } else if (filterType === 1) {
          // Band Pass
          const peakY = y + h * 0.25 - resBoost
          const stopY = y + h * 0.75
          return `M${x},${stopY} Q${x + w * 0.25},${stopY} ${cutoffX - w * 0.1},${midY}
                  Q${cutoffX},${peakY} ${cutoffX + w * 0.1},${midY}
                  Q${x + w * 0.75},${stopY} ${x + w},${stopY}`
        } else if (filterType === 2) {
          // High Pass
          const passY = y + h * 0.2
          const stopY = y + h * 0.8
          const peakY = passY + resBoost
          return `M${x},${stopY} Q${cutoffX - w * 0.12},${stopY} ${cutoffX - w * 0.03},${peakY + resBoost * 0.3}
                  Q${cutoffX},${peakY} ${cutoffX + w * 0.08},${passY}
                  L${x + w},${passY}`
        } else if (filterType === 3) {
          // Band Reject (Notch)
          const passY = y + h * 0.25
          const notchY = y + h * 0.75 - resBoost
          return `M${x},${passY} L${cutoffX - w * 0.1},${passY}
                  Q${cutoffX - w * 0.03},${notchY} ${cutoffX},${notchY}
                  Q${cutoffX + w * 0.03},${notchY} ${cutoffX + w * 0.1},${passY}
                  L${x + w},${passY}`
        }
      }
    }
    
    // Default center line
    return `M${x},${y + h / 2} L${x + w},${y + h / 2}`
  }
  
  // LFO waveforms - react to parameter values
  if (f.includes('lfo') || f.includes('Lfo')) {
    // Get rate and shape values if available
    const rate = norm(getVal(0, 64))
    const shape = norm(getVal(5, 0))  // Shape parameter index
    
    if (f.includes('Shp') || f.includes('shp')) {
      // LFO Shape - modulated waveform
      const modAmount = norm(getVal(8, 0))  // ShapeMod
      const yOffset = (shape * h * 0.3) + (modAmount * h * 0.2)
      return `M${x},${y + h / 2} 
              Q${x + w * (0.25 + rate * 0.1)},${y + yOffset} ${x + w * 0.5},${y + h / 2} 
              Q${x + w * (0.75 - rate * 0.1)},${y + h - yOffset} ${x + w},${y + h / 2}`
    }
    
    // Standard LFO - sine wave with rate affecting frequency visualization
    const freq = 0.3 + (rate * 0.4)  // 0.3 to 0.7
    return `M${x},${y + h / 2} 
            C${x + w * freq},${y} ${x + w * freq},${y + h} ${x + w * 0.5},${y + h / 2}
            C${x + w * (1 - freq)},${y} ${x + w * (1 - freq)},${y + h} ${x + w},${y + h / 2}`
  }
  
  // Oscillator waveforms
  if (f.includes('osc') || f.includes('Osc')) {
    const shape = norm(getVal(6, 64))  // Shape/PW parameter
    
    if (f.includes('ShpB') || f.includes('shpB')) {
      // Osc Shape B - pulse width varies with shape parameter
      const pulseWidth = 0.3 + (shape * 0.4)  // 0.3 to 0.7
      const topY = y + h * 0.2
      const bottomY = y + h * 0.8
      return `M${x},${y + h / 2} L${x + w * pulseWidth},${y + h / 2} L${x + w * pulseWidth},${topY} 
              L${x + w * (pulseWidth + 0.3)},${topY} L${x + w * (pulseWidth + 0.3)},${bottomY} 
              L${x + w},${bottomY} L${x + w},${y + h / 2}`
    }
    
    // Osc Shape A - sawtooth with shape affecting slope
    const slope = 0.2 + (shape * 0.3)  // 0.2 to 0.5
    return `M${x},${y + h / 2} L${x + w * slope},${y + h * 0.2} L${x + w * (slope + 0.2)},${y + h * 0.8} 
            L${x + w * (slope + 0.4)},${y + h * 0.2} L${x + w * (slope + 0.6)},${y + h * 0.8} L${x + w},${y + h / 2}`
  }
  
  // ADSR envelopes - dynamic based on A, D, S, R values
  if (f.includes('adsr') || f.includes('ADSR')) {
    // ADSR parameter indices: Attack=1, Decay=2, Sustain=3, Release=4
    const attack = norm(getVal(1, 20))    // Attack time
    const decay = norm(getVal(2, 40))     // Decay time  
    const sustain = norm(getVal(3, 80))   // Sustain level
    const release = norm(getVal(4, 30))   // Release time
    
    const attackX = x + w * (0.05 + attack * 0.25)  // 5% to 30%
    const decayX = attackX + w * (0.05 + decay * 0.25)  // Decay after attack
    const sustainY = y + h * (1 - sustain * 0.9)  // Sustain level (inverted, higher value = higher on graph)
    const releaseStartX = x + w * (0.7 - release * 0.2)  // Release starts earlier for longer release
    
    if (f.includes('M') || f.includes('m')) {
      // Mod ADSR - slightly different curve
      return `M${x},${y + h} L${attackX},${y + h * 0.1} 
              L${decayX},${sustainY} 
              L${releaseStartX},${sustainY} 
              L${x + w},${y + h}`
    }
    
    // Standard ADSR
    return `M${x},${y + h} L${attackX},${y + h * 0.05} 
            L${decayX},${sustainY} 
            L${releaseStartX},${sustainY} 
            L${x + w},${y + h}`
  }
  
  // AHD envelope - dynamic based on A, H, D values
  if (f.includes('ahd') || f.includes('AHD')) {
    const attack = norm(getVal(1, 30))
    const hold = norm(getVal(2, 40))
    const decay = norm(getVal(4, 50))
    
    const attackX = x + w * (0.05 + attack * 0.2)
    const holdEndX = attackX + w * (0.05 + hold * 0.2)
    const decayEndX = holdEndX + w * (0.05 + decay * 0.25)
    
    return `M${x},${y + h} L${attackX},${y + h * 0.05} 
            L${holdEndX},${y + h * 0.05} 
            L${decayEndX},${y + h * 0.5} 
            L${x + w},${y + h}`
  }
  
  // Hold envelope
  if (f.includes('henv') || f.includes('Henv')) {
    const hold = norm(getVal(0, 50))
    const holdWidth = 0.1 + (hold * 0.3)
    const holdY = y + h * 0.25
    
    return `M${x},${y + h} L${x + w * 0.2},${holdY} 
            L${x + w * (0.2 + holdWidth)},${holdY} 
            L${x + w},${y + h}`
  }
  
  // Multi envelope - uses multiple time/level pairs
  if (f.includes('multi') || f.includes('Multi')) {
    // Multi env params: L0, L1, L2, L3, T0, T1, T2, T3
    const levels = [
      norm(getVal(0, 100)),
      norm(getVal(1, 80)),
      norm(getVal(2, 60)),
      norm(getVal(3, 40))
    ]
    const times = [
      norm(getVal(4, 20)),
      norm(getVal(5, 30)),
      norm(getVal(6, 25)),
      norm(getVal(7, 35))
    ]
    
    let path = `M${x},${y + h}`
    let currentX = x
    
    for (let i = 0; i < 4; i++) {
      currentX += w * (0.05 + times[i] * 0.2)
      const levelY = y + h * (1 - levels[i] * 0.9)
      path += ` L${currentX},${levelY}`
    }
    
    path += ` L${x + w},${y + h}`
    return path
  }
  
  // DX Router
  if (f.includes('dx') || f.includes('DX')) {
    const algorithm = Math.floor(getVal(0, 0) / 4)  // Algorithm 0-31
    const rows = 3
    const cols = 3
    const spacingX = w / (cols + 1)
    const spacingY = h / (rows + 1)
    
    let path = ''
    // Draw connection lines based on algorithm
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = x + spacingX * (col + 1)
        const py = y + spacingY * (row + 1)
        
        // Draw vertical connections
        if (row < rows - 1 && (algorithm + row + col) % 2 === 0) {
          path += `M${px},${py} L${px},${py + spacingY} `
        }
        // Draw horizontal connections
        if (col < cols - 1 && (algorithm + row) % 3 === 0) {
          path += `M${px},${py} L${px + spacingX},${py} `
        }
      }
    }
    
    return path || `M${x + w * 0.2},${y + h * 0.2} L${x + w * 0.2},${y + h * 0.8} 
            M${x + w * 0.5},${y + h * 0.2} L${x + w * 0.5},${y + h * 0.8}
            M${x + w * 0.8},${y + h * 0.2} L${x + w * 0.8},${y + h * 0.8}`
  }
  
  // Default based on type
  if (props.type === 'graph') {
    return `M${x},${y + h / 2} L${x + w},${y + h / 2}`
  }
  
  // Default envelope
  return `M${x},${y + h} L${x + w * 0.2},${y + h * 0.2} L${x + w * 0.5},${y + h * 0.5} L${x + w},${y + h}`
})

// Determine if we should fill the graph
const shouldFill = computed(() => {
  return props.type === 'graphenv' || props.f?.includes('env') || props.f?.includes('Env')
})
</script>

<template>
  <g class="graph">
    <!-- Define clip path to keep graph within bounds -->
    <defs>
      <clipPath :id="clipId">
        <rect :x="x" :y="y" :width="w" :height="h" />
      </clipPath>
    </defs>
    
    <!-- Background rectangle -->
    <rect
      :x="x"
      :y="y"
      :width="w"
      :height="h"
      :fill="type === 'graphenv' ? '#00A4A4' : '#088'"
      :stroke="type === 'graphenv' ? 'none' : undefined"
    />
    
    <!-- Graph path with clipping -->
    <path
      :d="graphPath"
      stroke="#AFA"
      :fill="shouldFill ? '#00A4A4' : 'none'"
      :clip-path="`url(#${clipId})`"
      stroke-width="1.5"
    />
    

  </g>
</template>

<style scoped>
.graph {
  pointer-events: none;
}
</style>
