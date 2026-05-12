/**
 * SVG Renderer for Nord Modular G2
 *
 * Main entry point for all rendering functionality
 */

// SVG Utilities
export { XMLNS, XLINK_NS, svgNSGet, svgUse, svgGroup, svgRect, svgCircle, svgLine, svgPath, svgText, svgClipPath, svgNested } from './svgUtils';

// Patchcord Math
export { Patchcord, FastVector, createFastVector } from './patchcord';

// Graph Functions
// export { lfoBgraph, lfoShpgraph, graphFunctions } from './graphFunctions';

// Cable Renderer
export { makePatchCables, removeAllCables, type Cable, type Module, type Jack } from './cableRenderer';

// Module Renderer
export { makeBasicPanel, makeSubElements, clearTemplateCache, removeAllModules, type ModuleDef, type ModuleInstance } from './moduleRenderer';

// Re-export from old renderer for backwards compatibility
// These will be gradually phased out as components migrate to the new structure
export { CABLE_COLORS, MODULE_COLORS } from '../constants';

// Module definitions - expose on window for backward compatibility with parser
export { getModule, getModuleByName, getAllModules } from './nmg2mods';
