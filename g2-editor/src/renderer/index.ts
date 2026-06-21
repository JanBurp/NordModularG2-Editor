// SVG Utilities
export { XMLNS, XLINK_NS, svgRect, svgCircle, svgLine, svgPath, svgText, svgNested } from './svgUtils';

// Patchcord Math
export { Patchcord, FastVector, createFastVector } from './patchcord';

// Cable Renderer
export { makePatchCables, removeAllCables, type Cable, type Module, type Jack } from './cableRenderer';

// Re-export from old renderer for backwards compatibility
// These will be gradually phased out as components migrate to the new structure
export { CABLE_COLORS, MODULE_COLORS } from '../constants';

// Module definitions - expose on window for backward compatibility with parser
export { getModule, getModuleByName, getAllModules } from './nmg2mods';
