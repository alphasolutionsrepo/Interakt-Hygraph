"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Hands off to /search rather than searching inline — one search UI, one place. */
export function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(value.trim())}`);
      }}
      className="ml-auto"
      role="search"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search…"
        aria-label="Search"
        className="w-36 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:w-56 focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950"
      />
    </form>
  );
}
