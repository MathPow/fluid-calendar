import { cn } from "@/lib/utils";

export function PageHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("grid gap-1", className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeaderHeading({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn("display text-[32px] md:text-[40px]", className)}
      {...props}
    >
      {children}
    </h1>
  );
}

export function PageHeaderDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[15px] text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}
