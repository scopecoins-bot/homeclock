// App-entry met fout-diagnostiek:
// 1) foutenvanger installeren
// 2) expo-router laden; als het laden faalt, registreer een fout-scherm als
//    root-component (native runApplication gebruikt de laatst geregistreerde)
//    en stuur de fout via fetch naar de PC-logger.
require("./src/boot/error-capture.js");

var __hcLog = function (kind, msg) {
  try {
    fetch(
      "http://192.168.137.1:9911/log?msg=" +
        encodeURIComponent(String(kind + ": " + msg).slice(0, 900)),
      { method: "GET" }
    ).catch(function () {});
  } catch (err) {}
};

try {
  require("expo-router/entry");
  __hcLog("INFO", "expo-router geladen zonder fout");
} catch (e) {
  var msg = String((e && (e.message || e.stack)) || e);
  __hcLog("ROUTER-FATAL", msg);
  try {
    var React = require("react");
    var _rn = require("react-native");
    var ErrScreen = function () {
      return React.createElement(
        _rn.View,
        { style: { flex: 1, backgroundColor: "#101418", justifyContent: "center", padding: 24 } },
        React.createElement(
          _rn.Text,
          { style: { color: "#ff6b6b", fontSize: 16, fontWeight: "700", marginBottom: 10 } },
          "HomeClock startup-fout"
        ),
        React.createElement(
          _rn.Text,
          { style: { color: "#e8e8e8", fontSize: 12 } },
          msg.slice(0, 1800)
        )
      );
    };
    // Overschrijft de eventueel al geregistreerde root — native runApplication
    // gebeurt pas NA bundle-evaluatie en gebruikt dus dit scherm.
    _rn.AppRegistry.registerComponent("HomeClock", function () {
      return ErrScreen;
    });
  } catch (e2) {
    __hcLog("ROUTER-FATAL-DISPLAY-FAIL", String(e2));
  }
}
