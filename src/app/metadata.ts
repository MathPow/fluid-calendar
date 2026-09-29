import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DreamDash",
  description: "Your personal command center — calendar, tasks, email and notes",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DreamDash",
  },
  icons: {
    // SVG for browsers that take it, the .ico (16–256 px PNGs) for Safari
    // and the rest; iOS home screens need a PNG with a solid background.
    icon: [
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 256x256" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};
