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
  console: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  USBDevice: 'readonly',
  TouchEvent: 'readonly',
  DragEvent: 'readonly',
  Event: 'readonly',
  HTMLInputElement: 'readonly',
  MouseEvent: 'readonly',
  KeyboardEvent: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  SVGElement: 'readonly',
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
};

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.{ts,vue}'],
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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
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