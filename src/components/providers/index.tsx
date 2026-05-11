import { PropsWithChildren } from "react";

import { ServiceWorkerProvider } from "./ServiceWorkerProvider";
import { SessionProvider } from "./SessionProvider";
import { TanstackQueryProvider } from "./TanstackQueryProvider";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <TanstackQueryProvider>
      <ThemeProvider attribute="data-theme" enableSystem={true}>
        <SessionProvider>
          <ServiceWorkerProvider />
          {children}
        </SessionProvider>
      </ThemeProvider>
    </TanstackQueryProvider>
  );
}
