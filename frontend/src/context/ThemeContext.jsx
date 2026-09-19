import { useEffect, useLayoutEffect, useState } from "react";
import { ThemeContext } from "./theme";

function getSystemTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") return theme;

  return null;
}

function applyDomTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme() ?? getSystemTheme());

  // this applies light/dark mode
  useLayoutEffect(() => {
    applyDomTheme(theme);
  }, [theme]);

  // this stores the theme in local storage
  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const setTheme = (next) => setThemeState(next);

  const toggleTheme = () => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  };

  const value = { theme, setTheme, toggleTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
