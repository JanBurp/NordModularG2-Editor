<script setup>
import { watch } from 'vue';
import './renderer/nmg2mods.js';
import './renderer/parammap.js';
import './parser/nmg2PatchParser.js';
import PatchCanvas from './components/canvas/PatchCanvas.vue';
import PatchBrowser from './components/panels/PatchBrowser.vue';
import PatchData from './components/panels/PatchData.vue';
import ModulesPane from './components/panels/ModulesPane.vue';
import UsbPanel from './components/panels/UsbPanel.vue';
import Button from './components/toolbar/Button.vue';
import BtnGroup from './components/toolbar/BtnGroup.vue';
import ToolBar from './components/toolbar/ToolBar.vue';
import ToolBarDivider from './components/toolbar/ToolBarDivider.vue';

// Composables
import { usePatchManager } from './composables/usePatchManager';
import { useG2Connection } from './composables/useG2Connection';
import { useCableVisibility } from './composables/useCableVisibility';
import { usePatchCategory } from './composables/usePatchCategory';
import { useRightPanel } from './composables/useRightPanel';

// Constants
import { SOUND_CATEGORIES as soundCategories } from './constants';

// Initialize composables
const {
  patch,
  patchName,
  variation,
  selectedArea,
  currentModules,
  currentCables,
  areaModulesCount,
  areaCablesCount,
  handleFileLoad,
  handlePatchSelect
} = usePatchManager();

const {
  g2,
  deviceStatus,
  statusText,
  usbLogs,
  connectDevice,
  disconnectDevice,
  uploadToG2,
  downloadFromG2,
  clearLogs
} = useG2Connection();

const {
  cableColors,
  cableVisibility,
  cableShakeTrigger,
  allCablesVisible,
  toggleCableVisibility,
  toggleShowHideAll,
  shakeCables,
  syncWithPatchData,
  updatePatchData
} = useCableVisibility();

const {
  selectedCategory
} = usePatchCategory(patch);

const {
  rightPaneTab,
  showRightPane,
  toggleSidebar,
  handleToggleOff
} = useRightPanel();

// Watch for patch changes and sync cable visibility
watch(() => patch.value?.description, (description) => {
  syncWithPatchData(description);
}, { immediate: true, deep: true });

// Watch for cable visibility changes and update patch data
watch(cableVisibility, () => {
  updatePatchData(patch.value?.description);
}, { deep: true });
</script>

<template>
  <div class="app">
    <ToolBar>
      <Button variant="file" accept=".pch2,.prf2" @change="handleFileLoad">Load Patch</Button>
      <Button variant="default" :disabled="!patch">Save Patch</Button>
      <Button
        variant="default"
        :disabled="!patch || deviceStatus !== 'connected'"
        @click="uploadToG2(patch)"
      >
        Upload to G2
      </Button>
      <Button
        variant="default"
        :disabled="deviceStatus !== 'connected'"
        @click="downloadFromG2"
      >
        Download from G2
      </Button>

      <ToolBarDivider />

      <span class="status" :class="{ connected: deviceStatus === 'connected' }">
        {{ statusText }}
      </span>

      <Button
        v-if="deviceStatus === 'connected'"
        variant="default"
        @click="disconnectDevice"
      >
        Disconnect
      </Button>
      <Button
        v-else
        variant="default"
        :disabled="deviceStatus === 'connecting'"
        @click="connectDevice"
      >
        {{ deviceStatus === 'connecting' ? 'Connecting...' : 'Connect G2' }}
      </Button>

      <ToolBarDivider />

      <BtnGroup
        v-model="selectedArea"
        :options="[{value:'voice',label:'Voice'}, {value:'fx',label:'FX'}]"
        variant="toggle"
      />

      <ToolBarDivider />

      <BtnGroup
        :model-value="rightPaneTab"
        :options="[
          { label: 'USB', value: 'usb' },
          { label: 'Browser', value: 'browser' },
          { label: 'Modules', value: 'modules' },
          { label: 'Data', value: 'data', disabled: !patch }
        ]"
        variant="tab"
        @update:model-value="toggleSidebar"
        @toggle-off="handleToggleOff"
      />
    </ToolBar>

    <ToolBar v-if="patchName">
        <span class="toolbar-label">{{ patchName }}</span>

        <div class="category-wrapper">
          <span class="toolbar-label">Cat:</span>
          <select
            v-model="selectedCategory"
            class="category-select"
            title="Sound Category"
          >
            <option
              v-for="cat in soundCategories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </div>

        <ToolBarDivider />

        <span class="toolbar-info">
        Voice: {{ areaModulesCount('voice') }} modules, {{ areaCablesCount('voice') }} cables<br>
        FX: {{ areaModulesCount('fx') }} modules, {{ areaCablesCount('fx') }} cables<br>
        </span>

        <ToolBarDivider />

        <div class="variations-wrapper">
          <span class="toolbar-label">Var:</span>
          <BtnGroup
            v-model="variation"
            :options="[
              { label: '1', value: 0 },
              { label: '2', value: 1 },
              { label: '3', value: 2 },
              { label: '4', value: 3 },
              { label: '5', value: 4 },
              { label: '6', value: 5 },
              { label: '7', value: 6 },
              { label: '8', value: 7 }
            ]"
            variant="variation"
          />
        </div>

        <ToolBarDivider />

        <div class="cable-visibility-wrapper">
          <span class="toolbar-label">Cables:</span>
          <div class="cable-toggles">
            <button
              v-for="color in cableColors"
              :key="color.name"
              class="cable-toggle"
              :class="{ visible: cableVisibility[color.name] }"
              :style="{ backgroundColor: color.hex, borderColor: color.hex }"
              :title="color.label + (cableVisibility[color.name] ? ' (visible)' : ' (hidden)')"
              @click="toggleCableVisibility(color.name)"
            >
              <span class="cable-toggle-indicator"></span>
            </button>
            <button
              class="cable-toggle cable-toggle-all"
              :class="{ visible: allCablesVisible }"
              :title="allCablesVisible ? 'Hide all cables' : 'Show all cables'"
              @click="toggleShowHideAll"
            >
              H
            </button>
            <button
              class="cable-toggle cable-toggle-shake"
              title="Re-render cables"
              @click="shakeCables"
            >
              S
            </button>
          </div>
        </div>
    </ToolBar>

    <div class="main-content">
      <div class="canvas-container">
        <template v-if="patch">
          <PatchCanvas
            :key="patchName"
            :modules="currentModules"
            :cables="currentCables"
            :variation="variation"
            :area="selectedArea"
            :cable-visibility="cableVisibility"
            :shake-trigger="cableShakeTrigger"
          />
        </template>
        <div v-else class="empty-state">
          Load a .pch2 or .prf2 file to begin
        </div>
      </div>

      <div v-if="showRightPane" class="right-pane">
        <div class="right-pane-content">
          <UsbPanel
            v-show="rightPaneTab === 'usb'"
            :logs="usbLogs"
            :device-status="deviceStatus"
            @disconnect="disconnectDevice"
            @connect="connectDevice"
            @clear-logs="clearLogs"
          />
          <PatchBrowser
            v-show="rightPaneTab === 'browser'"
            :isActive="rightPaneTab === 'browser'"
            @select="handlePatchSelect"
          />
          <PatchData
            v-show="rightPaneTab === 'data' && patch"
            :patch="patch"
          />
          <ModulesPane
            v-show="rightPaneTab === 'modules'"
            :isActive="rightPaneTab === 'modules'"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cable-visibility-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cable-toggles {
  display: flex;
  gap: 4px;
}

.cable-toggle {
  width: 20px;
  height: 20px;
  border: 2px solid;
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.4;
}

.cable-toggle:hover {
  opacity: 0.7;
  transform: scale(1.1);
}

.cable-toggle.visible {
  opacity: 1;
  box-shadow: 0 0 4px currentColor;
}

.cable-toggle-indicator {
  width: 8px;
  height: 8px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.cable-toggle.visible .cable-toggle-indicator {
  opacity: 1;
}

.cable-toggle-all {
  background-color: #ccc !important;
  border-color: #999 !important;
  color: #333;
  font-size: 11px;
  font-weight: bold;
  width: 24px;
}

.cable-toggle-all:hover {
  background-color: #bbb !important;
}

.cable-toggle-all.visible {
  background-color: #888 !important;
  border-color: #666 !important;
  color: #fff;
  box-shadow: 0 0 4px rgba(0,0,0,0.3);
}

.cable-toggle-shake {
  background-color: #ddd !important;
  border-color: #bbb !important;
  color: #333;
  font-size: 11px;
  font-weight: bold;
  width: 24px;
  margin-left: 4px;
}

.cable-toggle-shake:hover {
  background-color: #ccc !important;
  transform: scale(1.1);
}

.cable-toggle-shake:active {
  background-color: #aaa !important;
  transform: scale(0.95);
}

.toolbar-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.category-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.category-select {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid #999;
  border-radius: 3px;
  background-color: #f5f5f5;
  color: #333;
  cursor: pointer;
  min-width: 100px;
}

.category-select:hover {
  background-color: #e8e8e8;
}

.category-select:focus {
  outline: none;
  border-color: #666;
  box-shadow: 0 0 3px rgba(0,0,0,0.2);
}
</style>
