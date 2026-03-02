"use client";

import { cn } from "@/lib/utils/cn";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-mono uppercase text-[#445e5f] tracking-wide"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "bg-[#f7f7f5] border border-[rgba(34,47,48,0.1)] rounded-[12px]",
            "px-[22px] py-[18px] text-lg text-[#222f30] w-full",
            "transition-all duration-300",
            "placeholder:text-[#445e5f] placeholder:opacity-60",
            "focus:border-[#a7e26e] focus:ring-0 focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)]",
            error && "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="text-sm text-[#445e5f]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
