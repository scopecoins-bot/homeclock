import React, { useEffect, useState } from "react";
import { THEMES, type ThemeColors, themeForHour } from "@/core/theme";

/** Live Date, ticking every second (clock is the main UI element). */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useTheme(now: Date): ThemeColors {
  const period = themeForHour(now.getHours());
  return THEMES[period];
}
