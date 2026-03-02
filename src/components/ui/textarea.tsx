"use client";

import { cn } from "@/lib/utils/cn";
import { forwardRef } from "react";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-mono uppercase text-[#445e5f] tracking-wide"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "bg-[#f7f7f5] border border-gray-200 rounded-xl",
            "px-5 py-4 text-base text-[#222f30] min-h-[120px] resize-y w-full",
            "transition-all duration-300",
            "placeholder:text-[#445e5f] placeholder:opacity-60",
            "focus:border-[#a7e26e] focus:ring-0 focus:shadow-[0_0_0_3px_rgba(167,226,110,0.2)]",
            error && "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
