import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";

import { darkColors, lightColors, type ThemeColors } from "./theme";
import { useSettingsStore } from "../store/useSettingsStore";

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme_preference = useSettingsStore((s) => s.theme_preference);
  const systemScheme = useColorScheme();

  let isDark: boolean;
  if (theme_preference === "dark") {
    isDark = true;
  } else if (theme_preference === "light") {
    isDark = false;
  } else {
    // "system" — follow the OS
    isDark = systemScheme !== "light";
  }

  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    if (theme_preference !== "system") {
      Appearance.setColorScheme(theme_preference);
    }
  }, [theme_preference]);

  return (
    <ThemeContext.Provider value={{ colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
