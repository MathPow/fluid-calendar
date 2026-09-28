import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

export const metadata = {
  title: "Reset Password - DreamDash",
  description: "Reset your DreamDash account password",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="page flex h-20 items-center">
        <span className="text-[22px] font-extrabold leading-none tracking-display">
          DreamDash
        </span>
      </header>
      <main className="page flex flex-1 flex-col items-center pb-16 pt-6 md:pt-14">
        <h1 className="display mb-10 text-center text-[44px] sm:text-[64px] md:text-[80px]">
          New password.
        </h1>
        <PasswordResetForm />
      </main>
    </div>
  );
}
