import { cn } from "@/lib/utils/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "bordered";
}

export function Card({
  className,
  variant = "default",
  children,
  ...props
}: CardProps) {
  const variants = {
    default: "bg-white rounded-[var(--radius-lg)]",
    elevated:
      "bg-white rounded-[var(--radius-xl)] shadow-[0_20px_60px_rgba(34,47,48,0.1)]",
    bordered:
      "bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)]",
  };

  return (
    <div className={cn(variants[variant], className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6 pb-0", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6 pt-0", className)} {...props}>
      {children}
    </div>
  );
}
