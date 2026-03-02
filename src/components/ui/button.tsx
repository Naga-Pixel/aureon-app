"use client";

import { cn } from "@/lib/utils/cn";
import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-300 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-[var(--color-primary)] text-white hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)] hover:-translate-y-0.5 hover:shadow-lg focus:ring-[var(--color-accent)]",
      secondary:
        "bg-white text-[var(--color-primary)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] focus:ring-[var(--color-accent)]",
      accent:
        "bg-[var(--color-accent)] text-[var(--color-primary)] hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(167,226,110,0.3)] focus:ring-[var(--color-accent)]",
      outline:
        "border-2 border-[var(--color-primary)] text-[var(--color-primary)] bg-transparent hover:bg-[var(--color-primary)] hover:text-white focus:ring-[var(--color-primary)]",
      ghost:
        "text-[var(--color-primary)] hover:bg-[var(--color-bg)] focus:ring-[var(--color-accent)]",
    };

    const sizes = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
