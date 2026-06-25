import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <LayoutDashboard className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Your day at a glance — events, tasks, and email across your stations.
        Coming together soon.
      </p>
    </div>
  );
}
