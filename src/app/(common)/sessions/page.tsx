import { redirect } from "next/navigation";

// Sessions now live as a tab of Notes; keep the old address working.
export default function SessionsPage() {
  redirect("/notes?tab=sessions");
}
