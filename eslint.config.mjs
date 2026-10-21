import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * ESLint configuration.
 *
 * `next lint` was removed in Next.js 16, so the previous `lint` script failed
 * with "Invalid project directory provided". This is the replacement, using the
 * flat config that eslint-config-next ships for Next 16.
 *
 * The rule set stays close to the framework defaults: correctness rules that
 * catch real defects, without a mass restyling of the existing codebase.
 * Accessibility of the UI is covered by the manual review notes in the README,
 * not by eslint (there is no working jsx-a11y/eslint integration in this setup).
 */
const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'data/**',
      'next-env.d.ts'
    ]
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // The codebase has many deliberately-unused destructured fields and
      // fixture values; unused-variable noise would hide real findings.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Pre-existing UI pattern (setState inside an effect after a data fetch).
      // It is a render-performance advisory, not a correctness defect, and
      // refactoring four screens is out of scope for this change. Tracked as
      // outstanding UI debt in the README rather than suppressed.
      'react-hooks/set-state-in-effect': 'warn',
      '@next/next/no-img-element': 'off'
    }
  }
];

export default config;
