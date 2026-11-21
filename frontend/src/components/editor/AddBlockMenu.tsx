import { useEffect, useRef } from "react";
import { blockChoices } from "../../storage/structureOps";
import type { Block } from "../../types/page";

interface Props {
  /** The "+ Add" button that opened the menu; the menu is placed just below it. */
  anchor: DOMRect;
  /** Inside a collapsible panel, where another collapsible section isn't allowed. */
  insidePanel: boolean;
  onPick: (type: Block["type"]) => void;
  onClose: () => void;
}

const WIDTH = 260;

export function AddBlockMenu({ anchor, insidePanel, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 320);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Add a section"
      style={{ left, top: Math.max(8, top), width: WIDTH }}
      className="fixed z-50 max-h-[300px] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-lg"
    >
      {blockChoices(insidePanel).map((choice) => (
        <button
          key={choice.type}
          type="button"
          role="menuitem"
          onClick={() => onPick(choice.type)}
          className="block w-full rounded-xl px-3 py-1.5 text-left text-sm text-navy hover:bg-purple-soft focus:bg-purple-soft focus:outline-none"
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
