import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/SignInForm";

import { getAuthOptions } from "@/lib/auth/auth-options";

export const metadata = {
  title: "Sign In | DreamDash",
  description: "Sign in to your DreamDash account",
};

export default async function SignInPage() {
  // Check if user is already signed in
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="page flex h-20 items-center">
        <span className="text-[22px] font-extrabold leading-none tracking-display">
          DreamDash
        </span>
      </header>

      <main className="page flex flex-1 flex-col items-center pb-16 pt-6 md:pt-14">
        <h1 className="display text-center text-[44px] sm:text-[64px] md:text-[80px]">
          Welcome back.
        </h1>
        <p className="mt-6 max-w-md text-center text-[15px] leading-relaxed text-muted-foreground">
          Your personal command center — calendar, tasks, email and notes,
          all in one place.
        </p>

        <SignInForm />
      </main>
    </div>
  );
}
