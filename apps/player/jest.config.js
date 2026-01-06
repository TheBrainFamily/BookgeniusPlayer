export default {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/scripts"],
  transform: { "^.+\\.[tj]sx?$": "esbuild-jest-transform" },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@player/(.*)$": "<rootDir>/src/$1",
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
