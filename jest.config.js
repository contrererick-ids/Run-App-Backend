// jest.config.js
export default {
  testEnvironment: "node",
  collectCoverage: true,
  coverageReporters: ["json", "json-summary", "lcov", "text", "clover"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
