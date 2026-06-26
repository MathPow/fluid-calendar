/** Connection presets for the supported mail providers. */
export interface ProviderPreset {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** Short hint shown in the connect form. */
  hint: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  icloud: {
    id: "icloud",
    label: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    hint: "Use an app-specific password from appleid.apple.com (your normal password won't work).",
  },
  zoho: {
    id: "zoho",
    label: "Zoho",
    imapHost: "imap.zoho.com",
    imapPort: 993,
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    hint: "Enable IMAP in Zoho Mail settings and create an app password (Account → Security).",
  },
  imap: {
    id: "imap",
    label: "Other IMAP",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 465,
    hint: "Enter your provider's IMAP and SMTP host/port.",
  },
};

export function presetFor(provider: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS[provider];
}
