import { Link } from "react-router";

import { ThemeToggle } from "~/components/ThemeToggle";

export const SPEAKER_NAME = "Jeremy Meiss";
export const SPEAKER_TAGLINE =
  "Talks, slides and resources from conferences and meetups.";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link
          to="/"
          className="font-semibold tracking-tight transition-opacity hover:opacity-70"
        >
          {SPEAKER_NAME}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-[var(--muted)]">
        <p>
          © {new Date().getFullYear()} {SPEAKER_NAME}
        </p>
      </div>
    </footer>
  );
}
