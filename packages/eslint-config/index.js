import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint flat config for Embee Nexus V2.
 * Kept intentionally small: correctness-focused rules, formatting left to Prettier.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', '**/*.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The logging module's own transport writes structured JSON lines to
    // stdout/stderr; error boundaries log client-side render failures.
    files: ['**/lib/logging/**', '**/app/**/error.tsx', '**/app/**/global-error.tsx'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
  prettierConfig,
);
