import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brightblue text-white shadow-sm hover:bg-brightblue-dark disabled:bg-[#b9c6ff]",
  secondary: "border border-line bg-white text-navy hover:border-purple disabled:text-ink-muted/60",
  ghost: "text-navy hover:bg-purple-soft disabled:text-ink-muted/50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}
