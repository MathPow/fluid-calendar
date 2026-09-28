import localFont from "next/font/local";

/**
 * Brand type — Rethink Sans for UI and display, Newsreader for the
 * "voice" moments (a short serif phrase inside a tile, an italic annotation).
 * Both are variable fonts served locally so the PWA works offline.
 */
export const rethinkSans = localFont({
  src: [
    {
      path: "../../public/fonts/rethink-sans/RethinkSans-Variable.ttf",
      style: "normal",
      weight: "400 800",
    },
    {
      path: "../../public/fonts/rethink-sans/RethinkSans-Italic-Variable.ttf",
      style: "italic",
      weight: "400 800",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const newsreader = localFont({
  src: [
    {
      path: "../../public/fonts/newsreader/Newsreader-Variable.ttf",
      style: "normal",
      weight: "200 800",
    },
    {
      path: "../../public/fonts/newsreader/Newsreader-Italic-Variable.ttf",
      style: "italic",
      weight: "200 800",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});

/** Class list to put on <html> so every page gets both font variables. */
export const fontVariables = `${rethinkSans.variable} ${newsreader.variable}`;

/** @deprecated kept for older imports — resolves to the sans font. */
export const inter = rethinkSans;
