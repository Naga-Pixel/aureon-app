"use client";

import { cn } from "@/lib/utils/cn";
import { forwardRef } from "react";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  label?: string;
  options: readonly RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ name, label, options, value, onChange, error, className }, ref) => {
    return (
      <div ref={ref} className={cn("flex flex-col gap-3", className)}>
        {label && (
          <span className="text-sm font-[var(--font-mono)] uppercase text-[var(--color-text-muted)] tracking-wide">
            {label}
          </span>
        )}
        <div className="grid gap-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 p-4 rounded-[var(--radius-md)] cursor-pointer transition-all duration-200",
                "border border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]",
                value === option.value &&
                  "border-[var(--color-accent)] bg-[rgba(167,226,110,0.1)]"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.(e.target.value)}
                className="mt-0.5 h-5 w-5 text-[var(--color-accent)] border-[var(--color-border)] focus:ring-[var(--color-accent)] focus:ring-offset-0"
              />
              <div className="flex flex-col">
                <span className="font-medium text-[var(--color-text)]">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {option.description}
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

RadioGroup.displayName = "RadioGroup";
