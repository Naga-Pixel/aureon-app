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
          <span className="text-sm font-mono uppercase text-[#445e5f] tracking-wide">
            {label}
          </span>
        )}
        <div className="grid gap-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 p-4 rounded-[12px] cursor-pointer transition-all duration-200",
                "border border-[rgba(34,47,48,0.1)] bg-white hover:border-[#a7e26e]",
                value === option.value &&
                  "border-[#a7e26e] bg-[rgba(167,226,110,0.1)]"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.(e.target.value)}
                className="mt-0.5 h-5 w-5 text-[#a7e26e] border-gray-300 focus:ring-[#a7e26e] focus:ring-offset-0"
              />
              <div className="flex flex-col">
                <span className="font-medium text-[#222f30]">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-sm text-[#445e5f]">
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
