import { Providers } from "@/components/providers";
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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex h-full flex-col bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
