import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'push-server/lib', 'push-server/node_modules', 'push-server/.wrangler']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // French puts a no-break space before : ? ! ; so it stays with the word.
    files: ['src/i18n/*.ts'],
    rules: { 'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }] },
  },
])
