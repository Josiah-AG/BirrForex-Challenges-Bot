"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <div className="relative inline-flex items-center">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children || <HelpCircle size={16} className="text-gray-400 hover:text-gray-300" />}
      </div>
      {isVisible && (
        <div
          className={cn(
            "absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 border border-gray-700 rounded-lg shadow-lg whitespace-nowrap",
            side === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-2",
            side === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-2",
            side === "left" && "right-full top-1/2 -translate-y-1/2 mr-2",
            side === "right" && "left-full top-1/2 -translate-y-1/2 ml-2",
            className
          )}
        >
          {content}
          {/* Arrow */}
          <div
            className={cn(
              "absolute w-2 h-2 bg-gray-900 border-gray-700 rotate-45",
              side === "top" && "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r",
              side === "bottom" && "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l",
              side === "left" && "right-[-5px] top-1/2 -translate-y-1/2 border-t border-r",
              side === "right" && "left-[-5px] top-1/2 -translate-y-1/2 border-b border-l"
            )}
          />
        </div>
      )}
    </div>
  );
}

// Label with tooltip helper
interface LabelWithTooltipProps {
  label: string;
  tooltip: string;
  htmlFor?: string;
  required?: boolean;
}

export function LabelWithTooltip({ label, tooltip, htmlFor, required }: LabelWithTooltipProps) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-gray-300 flex items-center gap-2">
      {label}
      {required && <span className="text-loss">*</span>}
      <Tooltip content={tooltip} />
    </label>
  );
}
