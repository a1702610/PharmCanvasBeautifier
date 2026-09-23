import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function PasteCanvasModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (html: string) => void }) {
  const [html, setHtml] = useState("");
  return (
    <Modal
      open={open}
      wide
      title="Paste a Canvas page"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!html.trim()} onClick={() => { onAdd(html); setHtml(""); onClose(); }}>
            Add page
          </Button>
        </>
      }
    >
      <p className="font-serif text-sm leading-relaxed text-ink-muted">
        In Canvas, open the page, click <strong>Edit</strong>, then the <code>&lt;/&gt;</code> button (HTML editor). Select all, copy, and paste here.
      </p>
      <textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={12}
        spellCheck={false}
        placeholder="<div>…</div>"
        className="mt-4 w-full rounded-xl border border-line p-3 font-mono text-xs focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
      />
    </Modal>
  );
}
