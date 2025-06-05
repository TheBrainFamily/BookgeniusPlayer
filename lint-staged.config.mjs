export default {
  // Format everything that Prettier understands
  "*.{js,ts,tsx,jsx,json,md,yml}": ["prettier --write"],

  // Lint only the staged JS / TS files, with cache + auto-fix
  "*.{js,ts,tsx,jsx}": ["eslint --cache --fix"],
};
