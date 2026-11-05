import { getT, getLocale } from "@/i18n/server";

/**
 * Get the HTML template for password reset emails
 * @param name User's name
 * @param resetLink The password reset link
 * @param expirationDate The expiration date of the reset token
 * @returns HTML email template
 */
export async function getPasswordResetTemplate(
  name: string,
  resetLink: string,
  expirationDate: Date
): Promise<string> {
  const t = await getT();
  const locale = await getLocale();
  const formattedExpirationDate = expirationDate.toLocaleDateString(
    locale === "fr" ? "fr-FR" : "en-US",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }
  );

  return `
    <h1>${t("email.passwordReset.heading")}</h1>
    <p>${t("email.passwordReset.greeting", { name })}</p>
    <p>${t("email.passwordReset.intro")}</p>
    <p>${t("email.passwordReset.clickBelow")}</p>
    <a href="${resetLink}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">${t(
      "email.passwordReset.button"
    )}</a>
    <p>${t("email.passwordReset.expiresOn", {
      date: formattedExpirationDate,
    })}</p>
    <p>${t("email.passwordReset.fallbackCopy")}</p>
    <p style="word-break: break-all; color: #4F46E5;">${resetLink}</p>
    <p>${t("email.passwordReset.security")}</p>
    <p>${t("email.passwordReset.support")}</p>
  `;
}
