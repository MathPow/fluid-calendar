import { PropsWithChildren } from "react";

import { LocaleProvider } from "@/i18n/client";

import { ServiceWorkerProvider } from "./ServiceWorkerProvider";
import { SessionProvider } from "./SessionProvider";
import { StepUpProvider } from "./StepUpProvider";
import { TanstackQueryProvider } from "./TanstackQueryProvider";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <TanstackQueryProvider>
      <ThemeProvider attribute="data-theme" enableSystem={true}>
        <LocaleProvider>
          <SessionProvider>
            <ServiceWorkerProvider />
            <StepUpProvider />
            {children}
          </SessionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </TanstackQueryProvider>
  );
}
