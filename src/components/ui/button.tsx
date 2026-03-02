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
      "inline-flex items-center justify-center font-mono uppercase transition-all duration-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-[#222f30] text-white hover:bg-[#a7e26e] hover:text-[#222f30] hover:-translate-y-0.5 hover:shadow-lg focus:ring-[#a7e26e]",
      secondary:
        "bg-white text-[#222f30] border border-[rgba(34,47,48,0.1)] hover:border-[#a7e26e] hover:bg-[#f7f7f5] focus:ring-[#a7e26e]",
      accent:
        "bg-[#a7e26e] text-[#222f30] hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(167,226,110,0.3)] focus:ring-[#a7e26e]",
      outline:
        "border-2 border-[#222f30] text-[#222f30] bg-transparent hover:bg-[#222f30] hover:text-white focus:ring-[#222f30]",
      ghost:
        "text-[#222f30] hover:bg-[#f7f7f5] focus:ring-[#a7e26e]",
    };

    const sizes = {
      sm: "px-4 py-2 text-xs",
      md: "px-6 py-3 text-sm",
      lg: "px-8 py-4 text-sm",
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
