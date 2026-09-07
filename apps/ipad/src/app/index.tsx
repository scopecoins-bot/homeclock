import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useHomeClock } from "@/core/store";
import { AppShell } from "@/components/AppShell";
import { useClock, useTheme } from "@/hooks/use-theme-clock";
import { greetingFor, isoToClock, longDate, humanUntil, minutesUntil, nextOccurrence, weekdayLabel, formatTime } from "@/core/time";
import type { Lesson } from "@homeclock/shared";

/** Main dashboard: the clock is the hero; everything else is quiet support. */
export default function Dashboard() {
  const now = useClock();
  const theme = useTheme(now);
  const router = useRouter();
  const { alarms, lessons, weather, connection, lastSyncAt, ringingAlarm } = useHomeClock();

  const next = alarms
    .filter((a) => a.enabled)
    .map((a) => ({ a, at: nextOccurrence(a.hour, a.minute, a.weekdays, now) }))
    .filter(({ at }) => at > now)
    .sort((x, y) => x.at.getTime() - y.at.getTime())[0];

  const upcoming = upcomingLessons(lessons, now);
  const online = connection === "connected";

  return (
    <AppShell>
      <SafeAreaView style={styles.flex} edges={["right", "top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero clock */}
          <View style={styles.hero}>
            <Text style={[styles.clock, { color: theme.text }]} allowFontScaling={false}>
              {formatTime(now.getHours(), now.getMinutes())}
            </Text>
            <Text style={[styles.dateLine, { color: theme.textSecondary }]}>
              {longDate(todayKeyLocal(now))}
            </Text>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>
              {greetingFor(now.getHours())}
            </Text>
          </View>

          {/* Quiet status row */}
          <Text style={[styles.statusLine, { color: theme.textTertiary }]}>
            {online ? "● Verbonden met bossp" : "● Offline · laatst bijgewerkt " + shortTime(lastSyncAt)}
          </Text>

          <View style={styles.grid}>
            {/* Next alarm */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>Volgend alarm</Text>
              {next ? (
                <>
                  <Text style={[styles.cardValue, { color: theme.text }]}>
                    {formatTime(next.a.hour, next.a.minute)}
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    {weekdayLabel(next.a.weekdays)} · {humanUntil(minutesUntil(next.at, now))}
                  </Text>
                </>
              ) : (
                <Text style={[styles.cardValue, { color: theme.textTertiary }]}>—</Text>
              )}
              <Pressable
                onPress={() => router.navigate("/alarms")}
                hitSlop={12}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.link, { color: theme.accent }]}>Alarmen beheren</Text>
              </Pressable>
            </View>

            {/* School */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>School</Text>
              {upcoming.length === 0 ? (
                <Text style={[styles.cardValue, { color: theme.textTertiary }]}>Vandaag geen lessen</Text>
              ) : (
                <>
                  <Text style={[styles.cardValue, { color: theme.text }]}>
                    {isoToClock(upcoming[0]!.startIso)} {upcoming[0]!.subject}
                  </Text>
                  {upcoming[0]!.cancelled ? (
                    <Text style={[styles.cardSub, { color: theme.danger }]}>Uitgevallen</Text>
                  ) : (
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {[upcoming[0]!.room, upcoming[0]!.teacher].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                  {upcoming.length > 1 && (
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={2}>
                      Daarna: {upcoming.slice(1, 3).map((l) => `${isoToClock(l.startIso)} ${l.subject}`).join("  ·  ")}
                    </Text>
                  )}
                </>
              )}
              <Pressable
                onPress={() => router.navigate("/schedule")}
                hitSlop={12}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.link, { color: theme.accent }]}>Hele rooster</Text>
              </Pressable>
            </View>

            {/* Weather — one small card */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>
                {weather?.locationName ?? "Weer"}
              </Text>
              {weather ? (
                <>
                  <Text style={[styles.cardValue, { color: theme.text }]}>
                    {Math.round(weather.now.temperature)}°
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    {weather.now.condition} · {Math.round(weather.low)}–{Math.round(weather.high)}°
                  </Text>
                </>
              ) : (
                <Text style={[styles.cardValue, { color: theme.textTertiary }]}>—</Text>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppShell>
  );
}

function upcomingLessons(lessons: Lesson[], now: Date): Lesson[] {
  const today = todayKeyLocal(now);
  const inProgress = lessons.filter((l) => l.date === today);
  const upcoming = inProgress.filter((l) => new Date(l.endIso) >= now || l.cancelled === false && new Date(l.endIso) >= now);
  const visible = upcoming.length > 0 ? upcoming : inProgress;
  return visible
    .sort((a, b) => a.startIso.localeCompare(b.startIso))
    .filter((l) => new Date(l.endIso) >= now)
    .slice(0, 4);
}

function todayKeyLocal(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shortTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 44, gap: 28 },
  hero: { alignItems: "flex-start", gap: 4 },
  clock: { fontSize: 160, fontWeight: "300", letterSpacing: -6 },
  dateLine: { fontSize: 26, fontWeight: "500" },
  greeting: { fontSize: 22, fontWeight: "400" },
  statusLine: { fontSize: 13, marginTop: -12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  card: {
    flexGrow: 1,
    minWidth: 280,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 6,
  },
  cardLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  cardValue: { fontSize: 34, fontWeight: "600" },
  cardSub: { fontSize: 16 },
  link: { fontSize: 14, fontWeight: "600", marginTop: 8 },
});
