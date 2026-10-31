import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';

const allGlobals = {
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  USBDevice: 'readonly',
  TouchEvent: 'readonly',
  DragEvent: 'readonly',
  Event: 'readonly',
  HTMLInputElement: 'readonly',
  MouseEvent: 'readonly',
  PointerEvent: 'readonly',
  KeyboardEvent: 'readonly',
  FocusEvent: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  SVGElement: 'readonly',
  SVGGraphicsElement: 'readonly',
  SVGPathElement: 'readonly',
  SVGTextElement: 'readonly',
  SVGLineElement: 'readonly',
  SVGSVGElement: 'readonly',
  SVGClipPathElement: 'readonly',
  SVGGElement: 'readonly',
  SVGPolygonElement: 'readonly',
  SVGUseElement: 'readonly',
  SVGRectElement: 'readonly',
  SVGCircleElement: 'readonly',
  Node: 'readonly',
  EventTarget: 'readonly',
  HTMLDivElement: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLSelectElement: 'readonly',
  DOMMatrix: 'readonly',
  DOMPoint: 'readonly',
  SVGPoint: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  WheelEvent: 'readonly',
  DataTransfer: 'readonly',
  localStorage: 'readonly',
};

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.{ts,vue}', 'e2e/**/*.ts'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: allGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-undef': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // Playwright specs run in Node; fixtures need the `({}, use)` empty pattern
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      'no-empty-pattern': 'off',
    },
  },
  {
    files: ['src/renderer/nmg2mods.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  eslintConfigPrettier,
];