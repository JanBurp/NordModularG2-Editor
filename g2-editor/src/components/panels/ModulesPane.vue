<script setup>
import { ref, onMounted, watch, nextTick, reactive } from 'vue';
import Module from '../canvas/Module.vue';
import SearchInput from '../common/SearchInput.vue';

const props = defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
});

const categories = ref({
  'In/Out': ['Keyboard', '4-Out', '2-Out', 'Device', 'Fx-In', '2-In', '4-In', 'Status', 'MonoKey', 'NoteDet'],
  'Audio': ['OscA', 'OscB', 'OscC', 'OscD', 'Noise', 'MetNoise', 'DrumSynth', 'OscMaster', 'OscString', 'OscNoise', 'OscShpA', 'OscShpB', 'OscDual', 'OscPerc'],
  'Filter': ['FltLP', 'FltNord', 'FltMulti', 'FltClassic', 'FltVoice', 'FltStatic', 'FltPhase', 'FltHP', 'FltComb'],
  'Note': ['NoteQuant', 'PartQuant', 'NoteScaler', 'KeyQuant', 'Glide', 'ZeroCnt', 'PitchTrack', 'LevScaler'],
  'Envelope': ['EnvAD', 'EnvADS', 'EnvADSR', 'EnvAHD', 'EnvD', 'EnvH', 'EnvMulti', 'EnvFollow'],
  'LFO': ['LfoA', 'LfoB', 'LfoC', 'LfoShpA', 'ClkGen'],
  'Effect': ['Delay', 'Phaser', 'Chorus', 'RotSpk', 'Flanger', 'StChorus', 'Reverb', 'Eq2Band', 'Eq3Band', 'EqPeak', 'Compressor', 'FreqShift', 'Digitizer', 'PShift', 'Scratch', 'WahWah', 'Vocoder'],
  'Logic': ['Gate', 'Invert', 'ClkDiv', '8Counter', 'FlipFlop', 'BinCounter', 'Pulse', 'ADConv', 'DAConv', 'CompLev', 'MinMax'],
  'Seq': ['SeqNote', 'SeqEvent', 'SeqVal', 'SeqLev', 'SeqCtr'],
  'Mixer': ['Mix4-1B', 'Mix4-1C', 'Mix4-1A', 'Mix8-1B', 'Mix8-1A', 'MixFader', 'Mix2-1B', 'Mix2-1A', 'MixStereo', 'Pan', 'LevAmp', 'LevAdd', 'LevMult', 'LevMod', 'LevConv', 'X-Fade', 'Fade1-2', 'Fade2-1', 'Mux1-8', 'Mux8-1', 'Mux8-1X', 'Sw1-2', 'Sw1-4', 'Sw1-8', 'Sw2-1', 'Sw4-1', 'ValSw1-2', 'ValSw2-1', 'ConstSwT', 'ConstSwM', 'SwOnOffM', 'SwOnOffT'],
  'Shaper': ['Saturate', 'Overdrive', 'Clip', 'WaveWrap', 'Rect', 'ShpExp', 'ShpStatic', 'Constant', 'S&H', 'CompSig', 'ModAmt', 'NoiseGate']
});

const expandedCategories = ref(Object.keys(categories.value));
const searchQuery = ref('');

// Store module instances with reactive parameter values
const moduleInstances = reactive(new Map());

function toggleCategory(category) {
  const idx = expandedCategories.value.indexOf(category);
  if (idx >= 0) {
    expandedCategories.value.splice(idx, 1);
  } else {
    expandedCategories.value.push(category);
  }
}

function isExpanded(category) {
  return expandedCategories.value.includes(category);
}

function getModuleByName(name) {
  return window.modules?.getByIdByName(name);
}

function getModulesByCategory(category) {
  const moduleNames = categories.value[category] || [];
  let modules = moduleNames
    .map(name => getModuleByName(name))
    .filter(m => m);

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    modules = modules.filter(m => {
      const name = (m.shortnm || '').toLowerCase();
      return name.includes(query);
    });
  }

  return modules.sort((a, b) => a.id - b.id);
}

function getModuleHeight(module) {
  return (module.height || 2) * 16;
}

// Get or create module instance for testing
function getModuleInstance(moduleId) {
  if (!moduleInstances.has(moduleId)) {
    // Get module definition to initialize defaults
    const modDef = window.modules?.getById(moduleId);
    const defaultLv = modDef?.params?.map((param, idx) => {
      // For graph-related params, use sensible defaults
      const paramType = param.type;
      const paramName = param.name;
      
      // Check parammap for default
      const p = window.parammap?.[paramType];
      if (p?.def !== undefined) {
        return p.def;
      }
      
      // Default values for common param types
      if (paramType?.includes('Freq')) return 64;
      if (paramType?.includes('Res')) return 30;
      if (paramName?.includes('Slope') || paramName?.includes('Gain')) return 64;
      
      return 64;
    }) || [];
    
    moduleInstances.set(moduleId, {
      index: 0,
      type: moduleId,
      horiz: 0,
      vert: 0,
      colour: 0,
      lv: defaultLv,
      modes: []
    });
  }
  return moduleInstances.get(moduleId);
}

// Handle parameter changes from module controls
function onParamChange(moduleId, paramIndex, value) {
  const instance = moduleInstances.get(moduleId);
  if (instance) {
    instance.lv[paramIndex] = value;
  }
}

// Reset all module instances
function resetAllModules() {
  moduleInstances.clear();
}
</script>

<template>
  <div class="modules-pane">
    <SearchInput
      v-model="searchQuery"
      placeholder="Search modules..."
      :isActive="isActive"
    />
    <div v-for="(modules, category) in categories" :key="category" class="category-section" v-show="getModulesByCategory(category).length > 0">
      <div 
        class="category-header"
        @click="toggleCategory(category)"
      >
        <span class="expand-icon">{{ isExpanded(category) ? '▼' : '▶' }}</span>
        {{ category }}
        <span class="module-count">({{ getModulesByCategory(category).length }})</span>
      </div>
      
      <div v-if="isExpanded(category) && props.isActive" class="modules-list">
        <div
          v-for="module in getModulesByCategory(category)"
          :key="module.id"
          class="module-wrapper"
          :style="{ height: getModuleHeight(module) + 'px' }"
        >
          <svg
            width="256"
            :height="getModuleHeight(module)"
            xmlns="http://www.w3.org/2000/svg"
          >
            <Module 
              :type="module.id" 
              :instance="getModuleInstance(module.id)"
              @param-change="(modIdx, paramIdx, val) => onParamChange(module.id, paramIdx, val)"
            />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modules-pane {
  height: 100%;
  overflow-y: auto;
  padding: 8px 4px;
  background: #1e1e1e;
}

.category-section {
  margin-bottom: 16px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  border-bottom: 1px solid #333;
}

.category-header:hover {
  color: #e0e0e0;
}

.expand-icon {
  font-size: 10px;
  width: 12px;
  color: #666;
}

.module-count {
  font-weight: normal;
  color: #666;
  font-size: 11px;
}

.modules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.module-wrapper {
  width: 256px;
  background: #666;
  border-radius: 2px;
  overflow: visible;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.module-wrapper :deep(svg) {
  display: block;
}
</style>
