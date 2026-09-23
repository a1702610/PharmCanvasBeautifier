import { useEffect, useState } from "react";
import type { Tab } from "../../types/page";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

const SUGGESTIONS = [
  "Make this tab shorter",
  "Turn lists into tables where it fits",
  "Add a 'Why this matters clinically' callout",
  "Simplify the language",
];

interface Props {
  tab: Tab | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => void;
}

export function RegenerateDialog({ tab, busy, onClose, onSubmit }: Props) {
  const [instruction, setInstruction] = useState("");
  useEffect(() => {
    if (tab) setInstruction("");
  }, [tab]);

  return (
    <Modal
      open={tab !== null}
      title={`Regenerate "${tab?.title ?? ""}"`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !instruction.trim()} onClick={() => onSubmit(instruction.trim())}>
            {busy ? <><Spinner className="border-white/40 border-t-white" /> Regenerating…</> : "Regenerate"}
          </Button>
        </>
      }
    >
      <label className="block text-sm font-medium">
        What should change?
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          disabled={busy}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-serif text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setInstruction(s)}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted hover:border-purple hover:text-navy"
          >
            {s}
          </button>
        ))}
      </div>
    </Modal>
  );
}
