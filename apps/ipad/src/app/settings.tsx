import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHomeClock } from "@/core/store";
import { AppShell } from "@/components/AppShell";
import { useClock, useTheme } from "@/hooks/use-theme-clock";
import { relativeTime } from "@/core/time";

/** Settings + discreet diagnostics. Sensitive values are never shown in full. */
export default function SettingsScreen() {
  const now = useClock();
  const theme = useTheme(now);
  const store = useHomeClock();
  const [endpoint, setEndpoint] = useState(store.endpoint);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState<"idle" | "busy" | "error">("idle");
  const [statusText, setStatusText] = useState<string | null>(null);

  async function onPair() {
    setPairing("busy");
    try {
      await store.pair(endpoint.trim(), code.trim().toUpperCase());
      setPairing("idle");
      setCode("");
      setStatusText("Gekoppeld ✓");
      await store.syncNow();
    } catch (err) {
      setPairing("error");
      setStatusText((err as Error).message);
    }
  }

  function diagnostics(): string {
    return [
      `HomeClock iPad 1.0.0`,
      `Alarm engine: ${store.alarmEngine}`,
      `AlarmKit autorisatie: ${store.alarmKitAuth}`,
      `Native alarmen: ${store.nativeAlarmCount}`,
      `Server: ${store.endpoint}`,
      `Verbinding: ${store.connection}`,
      `Laatste sync: ${store.lastSyncAt ?? "—"}`,
      `Somtoday: ${store.somtodayState ?? "onbekend"}`,
      `Rooster (lokaal): ${store.lessons.length} lessen`,
      `Weer: ${store.weather ? store.weather.fetchedAt : "—"}`,
    ].join("\n");
  }

  return (
    <AppShell>
      <SafeAreaView style={styles.flex} edges={["right", "top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>Instellingen</Text>

          {/* Server */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Server</Text>
            <TextInput
              value={endpoint}
              onChangeText={setEndpoint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: theme.text, borderColor: theme.cardBorder }]}
              placeholder="https://bossp.<tailnet>.ts.net:8788"
              placeholderTextColor={theme.textTertiary}
            />
            {store.hasToken ? (
              <Text style={[styles.hint, { color: theme.statusOk }]}>
                Gekoppeld · token veilig opgeslagen in Keychain
              </Text>
            ) : (
              <>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  Voer de koppelcode van bossp in (`npm run pair` op de server).
                </Text>
                <View style={styles.pairRow}>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    style={[styles.input, styles.codeInput, { color: theme.text, borderColor: theme.cardBorder }]}
                    placeholder="XX-XXXX"
                    placeholderTextColor={theme.textTertiary}
                    maxLength={7}
                  />
                  <Pressable
                    onPress={() => void onPair()}
                    disabled={pairing === "busy" || code.length < 4}
                    style={[
                      styles.pairButton,
                      { backgroundColor: theme.accent, opacity: pairing === "busy" || code.length < 4 ? 0.5 : 1 },
                    ]}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Koppel</Text>
                  </Pressable>
                </View>
              </>
            )}
            {statusText && <Text style={[styles.hint, { color: pairing === "error" ? theme.danger : theme.statusOk }]}>{statusText}</Text>}
            <Pressable onPress={() => void store.syncNow()} hitSlop={8}>
              <Text style={[styles.link, { color: theme.accent }]}>
                Nu synchroniseren · laatst: {relativeTime(store.lastSyncAt ?? undefined, now)}
              </Text>
            </Pressable>
          </View>

          {/* Night */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Nacht & scherm</Text>
            <View style={[styles.rowBetween, styles.rowPad]}>
              <Text style={{ color: theme.text, fontSize: 17 }}>Scherm wakker houden</Text>
              <Switch
                value={store.settings.ui.keepAwake}
                onValueChange={(v) => void store.updateSettings({ ui: { ...store.settings.ui, keepAwake: v } })}
                trackColor={{ true: theme.accent, false: theme.textTertiary }}
              />
            </View>
            <View style={[styles.rowBetween, styles.rowPad]}>
              <Text style={{ color: theme.text, fontSize: 17 }}>
                Nacht helderheid ({store.settings.ui.nightBrightness}%)
              </Text>
            </View>
            <View style={styles.brightnessRow}>
              {[10, 15, 25, 40].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => void store.updateSettings({ ui: { ...store.settings.ui, nightBrightness: v } })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        store.settings.ui.nightBrightness === v ? theme.accent : "rgba(128,128,140,0.12)",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: store.settings.ui.nightBrightness === v ? "#FFFFFF" : theme.textSecondary,
                      fontWeight: "600",
                    }}
                  >
                    {v}%
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Weather location */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Weer</Text>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Locatie wordt op de server beheerd (momenteel: {store.settings.weather.locationName})
            </Text>
          </View>

          {/* Diagnostics */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Diagnostiek</Text>
            <View style={[styles.diag, { borderColor: theme.cardBorder }]}>
              {diagnostics()
                .split("\n")
                .map((line) => (
                  <Text key={line} style={[styles.diagLine, { color: theme.textSecondary }]}>
                    {line}
                  </Text>
                ))}
            </View>
            <Text style={[styles.hint, { color: theme.textTertiary }]}>Bevat nooit tokens of wachtwoorden.</Text>
          </View>

          <Text style={[styles.about, { color: theme.textTertiary }]}>HomeClock 1.0.0 · iPad</Text>
        </ScrollView>
      </SafeAreaView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 44, gap: 20 },
  title: { fontSize: 44, fontWeight: "700" },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 12,
  },
  sectionLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: { width: 140, textAlign: "center", letterSpacing: 4 },
  pairRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pairButton: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14 },
  hint: { fontSize: 14 },
  link: { fontSize: 14, fontWeight: "600" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowPad: { paddingVertical: 6 },
  brightnessRow: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  diag: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 4 },
  diagLine: { fontSize: 13, fontFamily: "Menlo" },
  about: { fontSize: 12, textAlign: "center", paddingBottom: 20 },
});
