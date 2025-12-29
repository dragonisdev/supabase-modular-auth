"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, hint, className = "", ...props }, ref) => {
    const hasError = !!error;
    const borderColor = hasError ? "border-red-500" : "border-gray-300";
    const focusRing = hasError ? "focus:ring-red-500" : "focus:ring-blue-500";

    return (
      <div>
        <label htmlFor={props.id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <input
          ref={ref}
          className={`w-full px-3 py-2 border ${borderColor} rounded-md focus:outline-none focus:ring-2 ${focusRing} ${className}`}
          {...props}
        />
        {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);

FormInput.displayName = "FormInput";
