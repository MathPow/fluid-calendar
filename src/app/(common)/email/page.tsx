import { Mail } from "lucide-react";

export default function EmailPage() {
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Mail className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Email</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        A unified inbox for your personal and work accounts. Connect iCloud and
        Zoho to get started.
      </p>
    </div>
  );
}
