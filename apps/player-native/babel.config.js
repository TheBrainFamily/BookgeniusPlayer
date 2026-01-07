module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@convex": "../../convex",
            "@player": "../player/src",
            "@player-native": "./src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
