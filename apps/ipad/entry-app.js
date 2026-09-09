// App-entry: eerst de foutenvanger, dan de Expo Router-runtime.
// package.json "main" wijst naar dit bestand, zodat de officiële CI-build
// (xcodebuild bundel-fase) de foutenvanger mee-neemt.
require("./src/boot/error-capture.js");
require("expo-router/entry");
