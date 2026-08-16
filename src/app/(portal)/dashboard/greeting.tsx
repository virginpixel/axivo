"use client";

import { useEffect, useState } from "react";

/** Time-of-day greeting, computed on the client so it matches the viewer's clock. */
export function Greeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return <span suppressHydrationWarning>{greeting ? `${greeting}, ${name}` : name}</span>;
}
