import type { Tab } from "../../types/page";
import { IconButton } from "../ui/IconButton";

interface Props {
  tabs: Tab[];
  activeIndex: number;
  historyCounts: Record<string, number>;
  onSelect: (index: number) => void;
  onRegenerate: (tab: Tab) => void;
  onUndo: (tab: Tab) => void;
}

export function TabRail({ tabs, activeIndex, historyCounts, onSelect, onRegenerate, onUndo }: Props) {
  return (
    <nav aria-label="Page sections">
      <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Tabs</h2>
      <ul className="mt-2 space-y-1">
        {tabs.map((tab, i) => (
          <li
            key={tab.id}
            className={`group flex items-center gap-1 rounded-xl pl-3 pr-1 ${i === activeIndex ? "bg-purple-soft" : "hover:bg-limestone-soft"}`}
          >
            <button type="button" className="min-w-0 flex-1 truncate py-2 text-left text-sm font-medium" onClick={() => onSelect(i)}>
              {tab.title}
            </button>
            <IconButton label={`Undo last change to ${tab.title}`} disabled={!historyCounts[tab.id]} onClick={() => onUndo(tab)}>↶</IconButton>
            <IconButton label={`Regenerate ${tab.title}`} onClick={() => onRegenerate(tab)}>⟳</IconButton>
          </li>
        ))}
      </ul>
    </nav>
  );
}
