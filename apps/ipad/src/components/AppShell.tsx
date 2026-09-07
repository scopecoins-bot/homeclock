import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { useRouter, usePathname } from "expo-router";
import { useHomeClock } from "@/core/store";
import { themeForHour, THEMES } from "@/core/theme";

/**
 * iPad shell: slim always-visible navigation rail on the left, content on the
 * right. Deliberately minimal — the clock owns the screen.
 */

const ITEMS = [
  { route: "/", icon: "house.fill", label: "Home" },
  { route: "/alarms", icon: "alarm.fill", label: "Alarmen" },
  { route: "/schedule", icon: "calendar", label: "Rooster" },
  { route: "/settings", icon: "gearshape.fill", label: "Instellingen" },
] as const;

const RAIL_WIDTH = 96;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { connection, endpoint } = useHomeClock();
  const hour = new Date().getHours();
  const theme = THEMES[themeForHour(hour)];

  return (
    <LinearGradient colors={[theme.bgTop, theme.bgBottom]} style={styles.flex}>
      <View style={styles.row}>
        <View style={[styles.rail, { backgroundColor: theme.card, borderRightColor: theme.cardBorder }]}>
          {ITEMS.map((item) => {
            const active = pathname === item.route;
            return (
              <Pressable
                key={item.route}
                accessibilityLabel={item.label}
                onPress={() => router.navigate(item.route)}
                style={[
                  styles.railItem,
                  active && { backgroundColor: theme.isDark ? "rgba(255,255,255,0.10)" : "rgba(59,116,216,0.12)" },
                ]}
              >
                <SymbolView
                  name={item.icon}
                  size={26}
                  tintColor={active ? theme.accent : theme.textTertiary}
                />
              </Pressable>
            );
          })}
          <View style={styles.railStatus}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    connection === "connected"
                      ? theme.statusOk
                      : connection === "connecting"
                        ? theme.statusWarn
                        : theme.statusOffline,
                },
              ]}
            />
          </View>
        </View>
        <View style={styles.content}>{children}</View>
      </View>
      <HiddenDebug endpoint={endpoint} />
    </LinearGradient>
  );
}

function HiddenDebug({ endpoint }: { endpoint: string }) {
  // Kept out of the render tree; the endpoint is shown in Settings.
  void endpoint;
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flex: 1, flexDirection: "row" },
  rail: {
    width: RAIL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
    gap: 18,
  },
  railItem: {
    width: 64,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  railStatus: { flex: 1, justifyContent: "flex-end" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  content: { flex: 1 },
});
