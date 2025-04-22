export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  transform: { "^.+\\.[tj]sx?$": "esbuild-jest-transform" },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1", "^@/(.*)$": "<rootDir>/$1" },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
