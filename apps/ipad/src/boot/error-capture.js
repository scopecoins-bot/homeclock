// Vangt alle JS-fouten af vóór de rest van de app laadt en toont/bewaart ze:
// - Alert op het scherm (direct zichtbaar op het device)
// - AsyncStorage onder "hc.debuglog" (uitleesbaar via SSH na een crash)
// - fetch naar de PC-logger (indien bereikbaar)
var LOGURL = "http://192.168.137.1:9911/log?msg=";

function sendLog(kind, msg) {
  var text = String(kind + ": " + msg).slice(0, 900);
  try {
    var AsyncStorage = require("@react-native-async-storage/async-storage").default;
    AsyncStorage.setItem("hc.debuglog", text).catch(function () {});
  } catch (err) {}
  try {
    fetch(LOGURL + encodeURIComponent(text), { method: "GET" }).catch(function () {});
  } catch (err) {}
  try {
    var { Alert } = require("react-native");
    if (kind === "FATAL") {
      Alert.alert("HomeClock fout", text);
    }
  } catch (err) {}
}

try {
  if (typeof global.ErrorUtils !== "undefined" && global.ErrorUtils.setGlobalHandler) {
    global.ErrorUtils.setGlobalHandler(function (e, isFatal) {
      var msg = "?";
      try {
        msg = e && (e.message || String(e));
        if (e && e.stack) msg += "\nSTACK: " + String(e.stack).slice(0, 500);
      } catch (err) {}
      sendLog(isFatal ? "FATAL" : "JSERROR", msg);
      global.__HC_LAST_ERROR = msg;
    });
    sendLog("INFO", "error-capture geinstalleerd");
  }
} catch (err) {}
