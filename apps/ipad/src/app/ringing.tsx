import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useClock } from "@/hooks/use-theme-clock";
import { useHomeClock } from "@/core/store";
import { formatTime, greetingFor } from "@/core/time";

/**
 * Alarm-active experience: replaces everything else while an alarm rings.
 * Enormous, unmistakable controls for half-awake fingers.
 */
export default function RingingScreen() {
  const now = useClock();
  const { ringingAlarm, dismissRing, snoozeRing } = useHomeClock();

  // AlarmKit owns the system presentation; this in-app screen mirrors it and is
  // the primary UI for the notification fallback.
  const snoozeMinutes = ringingAlarm?.snoozeMinutes ?? 5;

  return (
    <LinearGradient colors={["#0D1220", "#1A2138"]} style={styles.flex}>
      <View style={styles.center}>
        <Text style={styles.time} allowFontScaling={false}>
          {formatTime(now.getHours(), now.getMinutes())}
        </Text>
        <Text style={styles.greeting}>{greetingFor(now.getHours())}</Text>
        {ringingAlarm?.label ? <Text style={styles.label}>{ringingAlarm.label}</Text> : null}

        <View style={styles.buttons}>
          {snoozeMinutes > 0 && (
            <Pressable
              accessibilityLabel={`Snooze ${snoozeMinutes} minuten`}
              onPress={() => void snoozeRing(snoozeMinutes)}
              style={({ pressed }) => [styles.snooze, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.snoozeText}>Snooze {snoozeMinutes} min</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Alarm stoppen"
            onPress={dismissRing}
            style={({ pressed }) => [styles.stop, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  time: { fontSize: 190, fontWeight: "200", color: "#E8EDF8", letterSpacing: -6 },
  greeting: { fontSize: 34, color: "#B9C4DC", fontWeight: "500" },
  label: { fontSize: 24, color: "#8A96B4", marginTop: 4 },
  buttons: { flexDirection: "row", gap: 22, marginTop: 60 },
  snooze: {
    paddingVertical: 34,
    paddingHorizontal: 60,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  snoozeText: { color: "#C9D2E4", fontSize: 26, fontWeight: "700" },
  stop: {
    paddingVertical: 34,
    paddingHorizontal: 84,
    borderRadius: 999,
    backgroundColor: "#E8EDF8",
  },
  stopText: { color: "#0B1020", fontSize: 26, fontWeight: "800" },
});
