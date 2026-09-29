import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Correctness gate only (catches undefined identifiers and the like); no
// formatting opinions.
const rules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': 'off',
  'no-empty': 'off',
};

export default [
  { ignores: ['client/dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['server/**/*.js', 'e2e/**/*.js', '*.js', '*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules,
  },
  {
    files: ['client/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules,
  },
];
