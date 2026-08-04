import type { Metadata } from "next";
import { MyDashboard } from "@/components/my-dashboard";

export const metadata: Metadata = { title: "My activity" };

export default function MePage() {
  return <MyDashboard />;
}
