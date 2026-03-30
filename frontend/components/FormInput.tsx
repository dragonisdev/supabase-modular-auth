"use client";

import React, { forwardRef, type InputHTMLAttributes } from "react";

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
    const inputId = props.id;
    const hintId = inputId ? `${inputId}-hint` : undefined;
    const errorId = inputId ? `${inputId}-error` : undefined;
    const describedBy = hasError ? errorId : hint ? hintId : undefined;

    return (
      <div>
        <label
          htmlFor={props.id}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className={`w-full border px-3 py-2 ${borderColor} rounded-md focus:ring-2 focus:outline-none ${focusRing} ${className}`}
          {...props}
        />
        {hint && !error && (
          <p
            id={hintId}
            className="mt-1 text-xs text-gray-500"
          >
            {hint}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            className="mt-1 text-sm text-red-600"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

FormInput.displayName = "FormInput";
