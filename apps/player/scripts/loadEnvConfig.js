const fs = require('fs');
const path = require('path');

function loadEnvConfig(environment = 'development') {
  const configPath = path.resolve(__dirname, '..', 'env.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config[environment] || config.development;
}

module.exports = loadEnvConfig;