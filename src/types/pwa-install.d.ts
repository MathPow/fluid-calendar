declare namespace JSX {
  interface IntrinsicElements {
    "pwa-install": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      "manifest-url"?: string;
      name?: string;
      description?: string;
      icon?: string;
    };
  }
}
