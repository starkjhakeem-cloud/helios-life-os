module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.(test|spec).ts?(x)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^react-native$": "<rootDir>/__mocks__/react-native.ts",
  },
  setupFiles: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "jest.tsconfig.json" }],
  },
  transformIgnorePatterns: ["/node_modules/"],
};
