const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force CJS builds to avoid import.meta in ESM packages (e.g. socket.io-client)
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
