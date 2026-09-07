import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Weekday } from "@homeclock/shared";
import { useHomeClock } from "@/core/store";
import { AppShell } from "@/components/AppShell";
import { useClock, useTheme } from "@/hooks/use-theme-clock";
import { WEEKDAY_LABELS, formatTime } from "@/core/time";

const SOUNDS = [
  { id: "dawn", label: "Dageraad" },
  { id: "chime", label: "Bellen" },
  { id: "radial", label: "Radiaal" },
] as const;

const SNOOZE_OPTIONS = [0, 5, 9, 15] as const;

/** Full alarm editor: one screen, native iPad controls, no sub-navigation. */
export default function AlarmEditScreen() {
  const now = useClock();
  const theme = useTheme(now);
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const { alarms, saveAlarm, deleteAlarm } = useHomeClock();

  const existing = params.id ? alarms.find((a) => a.id === params.id) : undefined;

  const [time, setTime] = useState<Date>(() => {
    if (existing) {
      const d = new Date();
      d.setHours(existing.hour, existing.minute, 0, 0);
      return d;
    }
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [weekdays, setWeekdays] = useState<Weekday[]>(existing ? [...existing.weekdays] : [1, 2, 3, 4, 5]);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [sound, setSound] = useState(existing?.sound ?? "dawn");
  const [snooze, setSnooze] = useState(existing?.snoozeMinutes ?? 5);

  const title = useMemo(() => (existing ? "Alarm bewerken" : "Nieuw alarm"), [existing]);

  function toggleWeekday(d: Weekday) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function onSave() {
    await saveAlarm({
      id: existing?.id,
      hour: time.getHours(),
      minute: time.getMinutes(),
      label: label.trim(),
      enabled: existing?.enabled ?? true,
      weekdays,
      sound,
      snoozeMinutes: snooze,
    });
    router.back();
  }

  async function onDelete() {
    if (!existing) return;
    Alert.alert("Alarm verwijderen", `${formatTime(existing.hour, existing.minute)} verwijderen?`, [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: () => {
          void deleteAlarm(existing.id).then(() => router.back());
        },
      },
    ]);
  }

  return (
    <AppShell>
      <SafeAreaView style={styles.flex} edges={["right", "top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[styles.cancel, { color: theme.accent }]}>Annuleer</Text>
            </Pressable>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={() => void onSave()} hitSlop={10}>
              <Text style={[styles.save, { color: theme.accent }]}>Opslaan</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {/* Native iPad time picker (wheel, 24h) */}
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                locale="nl_NL"
                is24Hour
                onChange={(_, d) => d && setTime(d)}
                style={styles.picker}
              />
            </View>

            {/* Weekdays */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Herhalen</Text>
              <View style={styles.days}>
                {(WEEKDAY_LABELS.map((lbl, idx) => ({ lbl, idx })) as { lbl: string; idx: Weekday }[]).map(
                  ({ lbl, idx }) => {
                    const active = weekdays.includes(idx);
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => toggleWeekday(idx)}
                        style={[
                          styles.dayChip,
                          {
                            backgroundColor: active ? theme.accent : "rgba(128,128,140,0.12)",
                          },
                        ]}
                      >
                        <Text style={[styles.dayChipText, { color: active ? "#FFFFFF" : theme.textSecondary }]}>
                          {lbl}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            {/* Label */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Label</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="bijv. Rustige ochtend"
                placeholderTextColor={theme.textTertiary}
                style={[styles.input, { color: theme.text, borderColor: theme.cardBorder }]}
                maxLength={60}
              />
            </View>

            {/* Sound */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Geluid</Text>
              <View style={styles.chipRow}>
                {SOUNDS.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSound(s.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: sound === s.id ? theme.accent : "rgba(128,128,140,0.12)" },
                    ]}
                  >
                    <Text
                      style={{
                        color: sound === s.id ? "#FFFFFF" : theme.textSecondary,
                        fontWeight: "600",
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Snooze */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Snooze</Text>
              <View style={styles.chipRow}>
                {SNOOZE_OPTIONS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setSnooze(m)}
                    style={[
                      styles.chip,
                      { backgroundColor: snooze === m ? theme.accent : "rgba(128,128,140,0.12)" },
                    ]}
                  >
                    <Text
                      style={{
                        color: snooze === m ? "#FFFFFF" : theme.textSecondary,
                        fontWeight: "600",
                      }}
                    >
                      {m === 0 ? "Uit" : `${m} min`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Active toggle */}
            <View style={[styles.section, styles.rowBetween]}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Actief</Text>
              <Switch
                value={existing?.enabled ?? true}
                onValueChange={() => undefined}
                trackColor={{ true: theme.accent, false: theme.textTertiary }}
                pointerEvents="none"
              />
            </View>
          </View>

          {existing && (
            <Pressable onPress={() => void onDelete()} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <Text style={[styles.delete, { color: theme.danger }]}>Verwijder dit alarm</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 44, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 30, fontWeight: "700" },
  cancel: { fontSize: 17, fontWeight: "600" },
  save: { fontSize: 17, fontWeight: "700" },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 26,
    gap: 26,
    alignItems: "center",
  },
  pickerWrap: { height: 180, overflow: "hidden", justifyContent: "center" },
  picker: { width: 320 },
  section: { alignSelf: "stretch", gap: 10 },
  sectionLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  days: { flexDirection: "row", gap: 8 },
  dayChip: {
    width: 52,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipText: { fontSize: 15, fontWeight: "700" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  delete: { fontSize: 16, fontWeight: "600", textAlign: "center" },
});
