import type { Metadata, Viewport } from "next";
import { Newsreader, Roboto } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, getOrganisation } from "@/lib/data-source";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const roboto = Roboto({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Learn AI",
  description: "Daily AI-literacy brief for Australian professionals.",
  // No `manifest` entry yet — the web app manifest + icons are §7 PWA
  // infrastructure, out of scope for this UI-first phase (see build brief).
  // `themeColor` below still ships the spec's #1B3A5C visual requirement.
};

export const viewport: Viewport = {
  themeColor: "#1b3a5c",
  width: "device-width",
  initialScale: 1,
};

// Anti-FOUC: runs before hydration (next/script's beforeInteractive strategy
// injects it into <head>) so the correct theme is on the root element for
// the very first paint — no flash from a default light render followed by
// a dark re-paint. Reads the same localStorage key `ThemeToggle` writes to.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("learnai-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, org] = await Promise.all([getCurrentUser(), getOrganisation()]);

  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${roboto.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full">
        <AppShell cohortHref={`/org/${org.slug}`} streak={user.currentStreak}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
