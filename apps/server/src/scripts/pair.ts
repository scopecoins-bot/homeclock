import { loadConfig } from "../config.js";
import { openDb } from "../db.js";
import { createPairingCode } from "../auth.js";

/**
 * Pairing CLI: run on bossp via `npm run pair -- <device name>`.
 * Prints a 15-minute pairing code to enter in the HomeClock iPad app.
 */
const deviceName = process.argv[2] ?? "iPad";
const config = loadConfig();
const db = openDb(config.databasePath);
const code = createPairingCode(db, deviceName);

console.log("");
console.log("HomeClock device pairing");
console.log("------------------------");
console.log(`Device name : ${deviceName}`);
console.log(`Code        : ${code}`);
console.log("Valid for   : 15 minutes");
console.log("");
console.log("Enter this code in HomeClock on the iPad (Instellingen > Server koppelen).");
console.log("");
db.close();
