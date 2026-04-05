// jest.config.mjs
export default {
  testEnvironment: "node",
  transform: {}, // disable transforms unless you use Babel/ts-jest
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 30,
      functions: 45,
      lines: 50,
    },
  },
  // If you need .js treated as ESM explicitly:
  // extensionsToTreatAsEsm: ['.js'],
};
