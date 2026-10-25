"use client";
// Bottom tab bar for a crew, like a phone app. Tabs for features the crew turned off are hidden.
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; emoji: string; label: string; dot?: boolean };

export default function TabBar({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  // The Quest tab is the crew's root path, so match it exactly; the others by prefix.
  const active = (href: string) => (href === tabs[0].href ? path === href : path.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-3 border-ink bg-cream/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        {tabs.map((t) => {
          const on = active(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-w-14 flex-col items-center rounded-2xl px-2 py-1 text-xs font-bold transition-colors ${
                  on ? "bg-sun" : ""
                }`}
              >
                <span className={`text-2xl ${on ? "animate-pop" : ""}`}>{t.emoji}</span>
                {t.label}
                {t.dot && <span className="absolute right-2 top-1 h-2.5 w-2.5 rounded-full border-2 border-ink bg-red-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
