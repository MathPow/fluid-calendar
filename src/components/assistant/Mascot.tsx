import { cn } from "@/lib/utils";

/** The DreamDash mascot (public/logo.svg) as an inline, styleable SVG. */
export function Mascot({
  className,
  outlined = false,
}: {
  className?: string;
  /** A light outline so the black mascot stays visible on dark backgrounds. */
  outlined?: boolean;
}) {
  return (
    <svg
      viewBox="-12 -12 283 384"
      className={cn("text-[#19181c]", className)}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        stroke={outlined ? "white" : "none"}
        strokeWidth={outlined ? 18 : 0}
        strokeLinejoin="round"
        paintOrder="stroke"
        d="M251.57,54.45l-29.28-10.68,4.43-12.08c1.82-4.99-.73-10.58-5.72-12.4L176.09,2.81c-4.99-1.82-10.58.8-12.47,5.79l-44.66,122.11c-48.02-1.9-93.68,26.95-111.03,74.35-21.57,58.96,8.66,124.18,67.55,145.74,58.89,21.56,124.05-8.74,145.61-67.62,17.71-48.32.57-100.92-38.83-130.1l20.4-55.67,29.22,10.68c4.99,1.88,10.58-.73,12.46-5.72l13-35.52c1.82-4.99-.8-10.58-5.79-12.4ZM84.45,266.16l-19.69-17.88-20.71,16.62-8.31-10.35,25.14-20.2c2.59-2.04,6.24-1.93,8.62.27l23.89,21.73-8.94,9.81ZM167.3,268.75l-19.63-17.88-20.71,16.62-8.31-10.35,25.14-20.2c2.52-2.05,6.24-1.93,8.62.27l23.82,21.73-8.94,9.81Z"
      />
    </svg>
  );
}
