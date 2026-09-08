const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow .js-suffixed imports inside TypeScript packages (@homeclock/shared uses
// NodeNext-style "./types.js" imports) to resolve to the actual .ts sources.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (moduleName.endsWith(".js")) {
      for (const candidate of [
        moduleName.replace(/\.js$/, ".ts"),
        moduleName.replace(/\.js$/, ".tsx"),
      ]) {
        try {
          return context.resolveRequest(context, candidate, platform);
        } catch {
          // try next candidate
        }
      }
    }
    throw err;
  }
};

module.exports = config;
