import type { Note, NoteKind } from "../../types/page";

const LABEL: Record<NoteKind, { text: string; className: string }> = {
  image: { text: "Image", className: "bg-purple-soft text-navy" },
  flag: { text: "Check", className: "bg-amber-100 text-amber-900" },
  citation: { text: "Citation", className: "bg-sky-100 text-sky-900" },
  unplaced: { text: "Unplaced", className: "bg-rose-100 text-rose-900" },
};

export function NotesPanel({ notes }: { notes: Note[] }) {
  return (
    <section aria-labelledby="notes-heading" className="rounded-2xl bg-limestone-soft p-4">
      <h2 id="notes-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Notes for you
        <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] text-white">{notes.length}</span>
      </h2>
      {notes.length === 0 ? (
        <p className="mt-3 font-serif text-sm text-ink-muted">No issues found.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note, i) => (
            <li key={i} className="font-serif text-sm leading-snug">
              <span className={`mr-2 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-semibold ${LABEL[note.kind].className}`}>
                {LABEL[note.kind].text}
              </span>
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
