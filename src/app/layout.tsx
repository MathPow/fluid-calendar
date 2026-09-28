import { Providers } from "@/components/providers";

import { fontVariables } from "@/lib/fonts";

import { metadata as baseMetadata } from "./metadata";
import { viewport as baseViewport } from "./viewport";

export const metadata = baseMetadata;
export const viewport = baseViewport;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${fontVariables}`}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
