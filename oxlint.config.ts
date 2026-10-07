export default {
  plugins: ['typescript', 'react', 'promise'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: ['node_modules/**', '.output/**', '.wrangler/**', '.idea/**'],
  settings: {
    react: {
      version: '19.2.8',
    },
  },
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
  },
  rules: {
    'no-console': 'off',
    'no-debugger': 'error',
    eqeqeq: 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-duplicate-imports': 'error',
    'no-await-in-loop': 'off',
    'react/react-in-jsx-scope': 'off',
  },
}
