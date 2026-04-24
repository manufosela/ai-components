import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.astro/**', '**/coverage/**'],
  },
  js.configs.recommended,
  jsdoc.configs['flat/recommended'],
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        globalThis: 'readonly',
        window: 'readonly',
        document: 'readonly',
        customElements: 'readonly',
        HTMLElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLSlotElement: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      jsdoc,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/no-undefined-types': 'off',
      'jsdoc/valid-types': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': [
        'warn',
        { definedTags: ['customElement', 'fires', 'slot', 'csspart'] },
      ],
    },
  },
  prettierConfig,
];
