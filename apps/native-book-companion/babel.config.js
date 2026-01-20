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
            "@": "./",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
