#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Get environment from command line args
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const environment = envIndex !== -1 && args[envIndex + 1] ? args[envIndex + 1] : 'development';

// Remove --env and its value from args to pass the rest to the command
const filteredArgs = args.filter((arg, index) => index !== envIndex && index !== envIndex + 1);

// Load config
const configPath = path.resolve(__dirname, '..', 'env.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const envConfig = config[environment] || config.development;

// Set environment variables
Object.entries(envConfig).forEach(([key, value]) => {
  if (key !== 'base') { // 'base' is used by vite config, not as env var
    process.env[key] = value;
  }
});

// Also set BUILD_ENV for vite config to detect
if (environment === 'docker') {
  process.env.BUILD_ENV = 'docker';
}

// Execute the command with remaining args
if (filteredArgs.length > 0) {
  const command = filteredArgs[0];
  const commandArgs = filteredArgs.slice(1);
  
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}