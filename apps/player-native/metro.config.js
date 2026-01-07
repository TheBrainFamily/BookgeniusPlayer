/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// In a monorepo with bun, packages may be in:
// 1. Project's node_modules (symlinks)
// 2. Workspace root's node_modules
const nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.nodeModulesPaths = nodeModulesPaths;

// Allow Metro to follow symlinks (bun creates these)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
