import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Small on purpose.
 *
 * This package has no framework, no React and no DOM, so almost every rule a
 * site needs is irrelevant here. What is left is the type-aware set, which is
 * the part that earns its keep in a library other repositories depend on.
 */
export default tseslint.config(
  // The config and the vitest setup are not part of the compiled program, and
  // type-aware linting needs one.
  { ignores: ['node_modules/**', 'dist/**', 'eslint.config.mjs', 'vitest.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A findings list is data. Building one with `console` in a library would
      // be deciding how the caller reports, which is the caller's business.
      'no-console': 'error',
    },
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-unsafe-assignment': 'off' } },
);
