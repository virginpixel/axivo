"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/utils";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "axivo-theme";
const OPTIONS: Theme[] = ["light", "dark", "system"];

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Light / Dark / System appearance switch. The stored preference drives the
 * `.dark` class on <html>; the no-flash script in the root layout applies it
 * before first paint, and this keeps it in sync while the app is open.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setTheme(stored);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div className="flex gap-1 rounded-full bg-muted p-1">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={theme === option}
          className={cn(
            "flex-1 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
            theme === option
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
