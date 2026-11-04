import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/SignInForm";

import { getT } from "@/i18n/server";
import { getAuthOptions } from "@/lib/auth/auth-options";

export async function generateMetadata() {
  const t = await getT();
  return {
    title: t("auth.signIn.metaTitle"),
    description: t("auth.signIn.metaDescription"),
  };
}

export default async function SignInPage() {
  // Check if user is already signed in
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  const t = await getT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="page flex h-20 items-center">
        <span className="text-[22px] font-extrabold leading-none tracking-display">
          DreamDash
        </span>
      </header>

      <main className="page flex flex-1 flex-col items-center pb-16 pt-6 md:pt-14">
        <h1 className="display text-center text-[44px] sm:text-[64px] md:text-[80px]">
          {t("auth.signIn.heading")}
        </h1>
        <p className="mt-6 max-w-md text-center text-[15px] leading-relaxed text-muted-foreground">
          {t("auth.signIn.tagline")}
        </p>

        <SignInForm />
      </main>
    </div>
  );
}
