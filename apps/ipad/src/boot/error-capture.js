// Debug-boot v3: vangt JS-fouten en bewaart ze in AsyncStorage, zodat ze
// na een crash via SSH uitleesbaar zijn in de data-container.
var LOGURL = "http://192.168.137.1:9911/log?msg=";

function sendLog(kind, msg) {
  try {
    var AsyncStorage = require("@react-native-async-storage/async-storage").default;
    AsyncStorage.setItem("hc.debuglog", String(kind + ": " + msg).slice(0, 900)).catch(
      function () {}
    );
  } catch (err) {}
  try {
    fetch(LOGURL + encodeURIComponent(String(kind + ": " + msg).slice(0, 900)), {
      method: "GET",
    }).catch(function () {});
  } catch (err) {}
}

try {
  if (typeof global.ErrorUtils !== "undefined" && global.ErrorUtils.setGlobalHandler) {
    global.ErrorUtils.setGlobalHandler(function (e, isFatal) {
      var msg = "?";
      try {
        msg = e && (e.message || String(e));
        if (e && e.stack) msg += " || STACK: " + String(e.stack).slice(0, 600);
      } catch (err) {}
      sendLog(isFatal ? "FATAL" : "JSERROR", msg);
      global.__HC_LAST_ERROR = msg;
    });
    sendLog("INFO", "capture geinstalleerd");
  }
} catch (err) {}
