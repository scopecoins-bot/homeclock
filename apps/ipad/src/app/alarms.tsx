import React from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useHomeClock } from "@/core/store";
import { AppShell } from "@/components/AppShell";
import { useClock, useTheme } from "@/hooks/use-theme-clock";
import { formatTime, weekdayLabel } from "@/core/time";

/** Alarms list: create, edit, enable/disable, delete (via editor). */
export default function AlarmsScreen() {
  const now = useClock();
  const theme = useTheme(now);
  const router = useRouter();
  const { alarms, toggleAlarm, nativeAlarmCount, alarmEngine } = useHomeClock();

  const sorted = [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  return (
    <AppShell>
      <SafeAreaView style={styles.flex} edges={["right", "top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Alarmen</Text>
            <View style={styles.headerRight}>
              <Text style={[styles.engineNote, { color: theme.textTertiary }]}>
                {alarmEngine === "alarmkit"
                  ? `AlarmKit · ${nativeAlarmCount} gepland`
                  : `Fallback notificaties · ${nativeAlarmCount} gepland`}
              </Text>
              <Pressable
                accessibilityLabel="Nieuw alarm"
                onPress={() => router.push({ pathname: "/alarm-edit", params: { new: "1" } })}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.addButtonText, { color: "#FFFFFF" }]}>+ Nieuw</Text>
              </Pressable>
            </View>
          </View>

          {sorted.length === 0 && (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>
              Nog geen alarmen. Maak je eerste wekker aan.
            </Text>
          )}

          <View style={styles.list}>
            {sorted.map((alarm) => (
              <View
                key={alarm.id}
                style={[
                  styles.row,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder, opacity: alarm.enabled ? 1 : 0.55 },
                ]}
              >
                <Pressable
                  onPress={() => router.push({ pathname: "/alarm-edit", params: { id: alarm.id } })}
                  style={styles.rowMain}
                >
                  <Text style={[styles.time, { color: theme.text }]}>
                    {formatTime(alarm.hour, alarm.minute)}
                  </Text>
                  <View style={styles.rowSub}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>
                      {alarm.label || weekdayLabel(alarm.weekdays)}
                    </Text>
                    <Text style={[styles.days, { color: theme.textTertiary }]}>
                      {weekdayLabel(alarm.weekdays)}
                      {alarm.snoozeMinutes > 0 ? ` · snooze ${alarm.snoozeMinutes}m` : ""}
                    </Text>
                  </View>
                </Pressable>
                <Switch
                  value={alarm.enabled}
                  onValueChange={() => void toggleAlarm(alarm.id)}
                  trackColor={{ true: theme.accent, false: theme.textTertiary }}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 44, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 44, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  engineNote: { fontSize: 13 },
  addButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  addButtonText: { fontSize: 16, fontWeight: "700" },
  empty: { fontSize: 18 },
  list: { gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    gap: 18,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 22 },
  time: { fontSize: 46, fontWeight: "500", minWidth: 130 },
  rowSub: { gap: 2 },
  label: { fontSize: 18, fontWeight: "600" },
  days: { fontSize: 14 },
});
