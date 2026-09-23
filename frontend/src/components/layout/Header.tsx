import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useApiKey } from "../../hooks/useApiKey";
import { Button } from "../ui/Button";
import { ApiKeyModal } from "./ApiKeyModal";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-purple-soft text-navy" : "text-ink-muted hover:text-navy"}`;

export function Header() {
  const [key] = useApiKey();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold tracking-tight text-navy">PharmCanvas</span>
          <span className="hidden text-sm text-ink-muted md:inline">Canvas pages for pharmacy, in one house style</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          <NavLink to="/" end className={navClass}>Create</NavLink>
          <NavLink to="/pages" className={navClass}>My pages</NavLink>
        </nav>
        <Button variant={key ? "secondary" : "primary"} onClick={() => setOpen(true)}>
          {key ? "API key saved" : "Insert API Key"}
        </Button>
      </div>
      <ApiKeyModal open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
