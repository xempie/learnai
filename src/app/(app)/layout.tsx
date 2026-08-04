import { AppShell } from "@/components/app-shell";
import { CookieConsent } from "@/components/cookie-consent";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CookieConsent />
    </>
  );
}
