import React, { useEffect } from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as KeepAwake from "expo-keep-awake";
import { HomeClockProvider, useHomeClock } from "@/core/store";
import { themeForHour } from "@/core/theme";

function KeepAwakeAndRouting() {
  const { settings, ringingAlarm } = useHomeClock();
  const router = useRouter();
  const pathname = usePathname();

  // Scherm wakker houden — alleen zolang de instelling aanstaat.
  useEffect(() => {
    if (!settings.ui.keepAwake) return;
    let cancelled = false;
    KeepAwake.activateKeepAwakeAsync().catch(() => {});
    return () => {
      if (!cancelled) KeepAwake.deactivateKeepAwake();
    };
  }, [settings.ui.keepAwake]);

  // Wanneer een alarm rinkelt neemt het ringing-scherm de app over.
  useEffect(() => {
    if (ringingAlarm && pathname !== "/ringing") {
      router.replace("/ringing");
    }
    if (!ringingAlarm && pathname === "/ringing") {
      router.replace("/");
    }
  }, [ringingAlarm, pathname, router]);

  return null;
}

export default function RootLayout() {
  const hour = new Date().getHours();
  const dark = themeForHour(hour) === "night" || themeForHour(hour) === "evening";
  return (
    <HomeClockProvider>
      <StatusBar style={dark ? "light" : "dark"} />
      <KeepAwakeAndRouting />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="ringing" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      </Stack>
    </HomeClockProvider>
  );
}
