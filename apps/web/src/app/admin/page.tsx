import { redirect } from "next/navigation";

/** `/admin` on its own has nothing to show — the console starts at the review queue. */
export default function AdminIndexPage() {
  redirect("/admin/review");
}
