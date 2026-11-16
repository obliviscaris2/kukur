import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.worker, ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { args: 'none' }], 'no-empty': 'off' },
  },
];
