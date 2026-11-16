import { createContext, createSignal, onMount, useContext, type JSX } from "solid-js";

type Theme = "light" | "dark";
const ThemeContext = createContext<{
  theme: () => Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}>();

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider(props: { children: JSX.Element }) {
  const [theme, setThemeSignal] = createSignal<Theme>("light");

  onMount(() => {
    const stored = localStorage.getItem("family-tree-theme");
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setThemeSignal(initial);
    apply(initial);
  });

  function setTheme(next: Theme) {
    setThemeSignal(next);
    localStorage.setItem("family-tree-theme", next);
    apply(next);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggle: () => setTheme(theme() === "dark" ? "light" : "dark"),
      }}
    >
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
