// ESLint flat config for the whole workspace.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-mock/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      // Security: no raw HTML injection anywhere (THREAT-MODEL T-31, ARCHITECTURE-ESSENTIALS §17).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden. Render user and chain content as plain text.',
        },
      ],
      // Package boundaries: the web app may import only core and contracts (ARCHITECTURE §5).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@blacklist/domain',
                '@blacklist/db',
                '@blacklist/chains',
                '@blacklist/config',
                '@blacklist/domain/*',
                '@blacklist/db/*',
                '@blacklist/chains/*',
                '@blacklist/config/*',
              ],
              message: 'apps/web may import only @blacklist/core and @blacklist/contracts.',
            },
          ],
        },
      ],
    },
  },
  {
    // Mock code is loaded only through the guarded dynamic import of 'blacklist-mock-api', which
    // next.config.ts aliases to a stub outside mock builds (see scripts/check-mock-exclusion.mjs).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/lib/api/mock/**',
      'apps/web/src/components/layout/demo-banner.tsx',
      'apps/web/src/components/layout/mock-preview-controls.tsx',
      'apps/web/src/lib/api/mock-disabled.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/mock/*', '**/api/mock/**', '@/lib/api/mock/*', '@/lib/api/mock/**'],
              allowTypeImports: true,
              message: 'Import mock code only via the guarded dynamic import of "blacklist-mock-api".',
            },
            {
              // Contract schemas carry the CSP-safe Zod configuration (packages/contracts/src/zod.ts).
              group: ['zod'],
              allowTypeImports: true,
              message:
                'Use schemas from @blacklist/contracts; only type imports from zod are allowed in apps/web.',
            },
            {
              group: [
                '@blacklist/domain',
                '@blacklist/db',
                '@blacklist/chains',
                '@blacklist/config',
                '@blacklist/domain/*',
                '@blacklist/db/*',
                '@blacklist/chains/*',
                '@blacklist/config/*',
              ],
              message: 'apps/web may import only @blacklist/core and @blacklist/contracts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Command-line scripts report results on stdout.
    files: ['**/scripts/**/*.{js,mjs}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: [
      'apps/web/test/**/*.{ts,tsx}',
      'apps/web/src/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'tests/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
);
