/** @type {import('jest').Config} */
module.exports = {
  projects: [
    // ── Unit tests (default — no external dependencies) ──────────────
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/test'],
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/e2e/', '<rootDir>/test/beacon-voice-e2e.test.ts'],
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
    },

    // ── E2E tests (require AWS CLI, live infra, Slack tokens) ────────
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      roots: ['<rootDir>/test'],
      testMatch: ['<rootDir>/test/e2e/**/*.test.ts', '<rootDir>/test/beacon-voice-e2e.test.ts'],
      transform: { '^.+\\.tsx?$': 'ts-jest' },
    },
  ],
};
