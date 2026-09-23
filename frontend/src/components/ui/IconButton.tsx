import type { ButtonHTMLAttributes } from "react";

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm text-ink-muted transition-colors hover:bg-purple-soft hover:text-navy focus-visible:outline-2 focus-visible:outline-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
    />
  );
}
