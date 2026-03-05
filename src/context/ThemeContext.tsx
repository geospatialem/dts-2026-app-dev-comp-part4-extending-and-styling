import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type ThemeMode = "light" | "dark";

type ThemeState = {
  mode: ThemeMode;
};

type ThemeActions = {
  setLightTheme: () => void;
  setDarkTheme: () => void;
  toggleTheme: () => void;
};

const ThemeStateContext = createContext<ThemeState | null>(null);
const ThemeActionsContext = createContext<ThemeActions | null>(null);

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider(props: PropsWithChildren): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode>(getInitialThemeMode);

  const setLightTheme = useCallback(() => setMode("light"), []);
  const setDarkTheme = useCallback(() => setMode("dark"), []);
  const toggleTheme = useCallback(
    () =>
      setMode((currentMode) => (currentMode === "light" ? "dark" : "light")),
    [],
  );

  const state = useMemo<ThemeState>(() => ({ mode }), [mode]);

  const actions = useMemo<ThemeActions>(
    () => ({ setLightTheme, setDarkTheme, toggleTheme }),
    [setLightTheme, setDarkTheme, toggleTheme],
  );

  return (
    <ThemeStateContext value={state}>
      <ThemeActionsContext value={actions}>
        {props.children}
      </ThemeActionsContext>
    </ThemeStateContext>
  );
}

export function useThemeState(): ThemeState {
  const ctx = useContext(ThemeStateContext);
  if (!ctx) {
    throw new Error("useThemeState must be used within ThemeProvider");
  }
  return ctx;
}

export function useThemeActions(): ThemeActions {
  const ctx = useContext(ThemeActionsContext);
  if (!ctx) {
    throw new Error("useThemeActions must be used within ThemeProvider");
  }
  return ctx;
}
