import globals from 'globals';

export default [{
  files: ['src/**/*.js'],
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    globals: { ...globals.browser, globalThis: 'readonly' }
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    'no-empty': 'off',
    'no-fallthrough': 'off'
  }
}];
