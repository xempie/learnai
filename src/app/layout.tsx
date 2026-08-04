import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

/** Stands in for PolySans - used at weight 400 only, per DESIGN.md. */
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} - ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Five-minute AI episodes, daily quizzes and streaks. Learn AI alongside your colleagues and classmates.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#202020",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
