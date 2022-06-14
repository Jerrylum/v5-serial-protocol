/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
  preset: 'ts-jest',

  testEnvironment: 'node',

  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.ts?$': 'ts-jest',
  },

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8"
};
