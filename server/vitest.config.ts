import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.{test,spec,eval}.?(c|m)[jt]s?(x)'],
    testTimeout: 30000,
    hookTimeout: 15000,
  },
})
