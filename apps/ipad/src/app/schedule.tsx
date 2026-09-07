import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHomeClock } from "@/core/store";
import { AppShell } from "@/components/AppShell";
import { useClock, useTheme } from "@/hooks/use-theme-clock";
import { addDaysKey, isoToClock, longDate, todayKey } from "@/core/time";
import type { Lesson } from "@homeclock/shared";

type Range = "today" | "tomorrow" | "week";

const RANGE_LABELS: Record<Range, string> = {
  today: "Vandaag",
  tomorrow: "Morgen",
  week: "Week",
};

/** Dedicated timetable view (cached lessons; works offline). */
export default function ScheduleScreen() {
  const now = useClock();
  const theme = useTheme(now);
  const { lessons, connection } = useHomeClock();
  const [range, setRange] = useState<Range>("today");

  const today = todayKey(now);
  const shown: { key: string; items: Lesson[] }[] =
    range === "week"
      ? weekGroups(lessons, today)
      : [{ key: range === "today" ? today : addDaysKey(today, 1), items: dayLessons(lessons, range === "today" ? today : addDaysKey(today, 1)) }];

  return (
    <AppShell>
      <SafeAreaView style={styles.flex} edges={["right", "top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Rooster</Text>
            <View style={[styles.segmented, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRange(r)}
                  style={[styles.segment, range === r && { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: range === r ? "#FFFFFF" : theme.textSecondary, fontWeight: "600" }}>
                    {RANGE_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {connection !== "connected" && (
            <Text style={[styles.stale, { color: theme.textTertiary }]}>
              Offline · toont laatste gesynchroniseerde rooster
            </Text>
          )}

          {shown.every((g) => g.items.length === 0) && (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>Geen lessen bekend</Text>
          )}

          {shown.map((group) =>
            group.items.length === 0 ? null : (
              <View key={group.key} style={styles.dayGroup}>
                <Text style={[styles.dayTitle, { color: theme.textSecondary }]}>{longDate(group.key)}</Text>
                <View style={styles.dayList}>
                  {group.items
                    .slice()
                    .sort((a, b) => a.startIso.localeCompare(b.startIso))
                    .map((lesson) => (
                      <View
                        key={lesson.id}
                        style={[
                          styles.lesson,
                          {
                            backgroundColor: theme.card,
                            borderColor: theme.cardBorder,
                            opacity: lesson.cancelled ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.lessonTime, { color: theme.text }]}>
                          {isoToClock(lesson.startIso)} – {isoToClock(lesson.endIso)}
                        </Text>
                        <View style={styles.lessonMain}>
                          <Text
                            style={[
                              styles.lessonSubject,
                              { color: theme.text },
                              lesson.cancelled && { textDecorationLine: "line-through" },
                            ]}
                          >
                            {lesson.subject}
                          </Text>
                          <Text style={[styles.lessonSub, { color: theme.textSecondary }]}>
                            {[lesson.room, lesson.teacher].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        {lesson.cancelled && (
                          <Text style={[styles.badge, { color: theme.danger }]}>Uitgevallen</Text>
                        )}
                        {lesson.changed && !lesson.cancelled && (
                          <Text style={[styles.badge, { color: theme.statusWarn }]}>Gewijzigd</Text>
                        )}
                      </View>
                    ))}
                </View>
              </View>
            ),
          )}
        </ScrollView>
      </SafeAreaView>
    </AppShell>
  );
}

function dayLessons(lessons: Lesson[], key: string): Lesson[] {
  return lessons.filter((l) => l.date === key);
}

function weekGroups(lessons: Lesson[], today: string): { key: string; items: Lesson[] }[] {
  const groups: { key: string; items: Lesson[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(today, i);
    groups.push({ key, items: dayLessons(lessons, key) });
  }
  return groups;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 44, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 44, fontWeight: "700" },
  segmented: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  segment: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  stale: { fontSize: 13, marginTop: -12 },
  empty: { fontSize: 18 },
  dayGroup: { gap: 12 },
  dayTitle: { fontSize: 17, fontWeight: "700" },
  dayList: { gap: 10 },
  lesson: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 20,
  },
  lessonTime: { fontSize: 20, fontWeight: "600", minWidth: 130 },
  lessonMain: { flex: 1, gap: 2 },
  lessonSubject: { fontSize: 20, fontWeight: "600" },
  lessonSub: { fontSize: 14 },
  badge: { fontSize: 13, fontWeight: "700" },
});
