import type { StudyMaterials } from "../../types/page";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export function emptyStudy(): StudyMaterials {
  return { recordings: [], resources: [] };
}

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30";
const isBad = (u?: string) => !!u?.trim() && !/^https?:\/\//i.test(u.trim());
const Warn = ({ url }: { url?: string }) =>
  isBad(url) ? <p className="mt-1 text-xs text-amber-800">Links must start with https:// — this one will show as a placeholder.</p> : null;

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)) as T;
}

export function StudyMaterialsForm({ value, onChange }: { value: StudyMaterials; onChange: (v: StudyMaterials) => void }) {
  const set = (patch: Partial<StudyMaterials>) => onChange({ ...value, ...patch });
  const setHandout = (patch: { label?: string; url?: string }) => {
    const handout = clean({ ...value.handout, ...patch });
    const { handout: _drop, ...rest } = value;
    void _drop;
    onChange(Object.keys(handout).length ? { ...rest, handout } : rest);
  };
  const setRecording = (i: number, patch: Record<string, string>) =>
    set({ recordings: value.recordings.map((r, idx) => (idx === i ? clean({ ...r, ...patch }) : r)) });
  const setResource = (i: number, patch: Record<string, string>) =>
    set({ resources: value.resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-5 text-sm">
      <fieldset>
        <legend className="font-semibold">Handout</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input aria-label="Handout label" placeholder="e.g. Heart failure handout" className={input} value={value.handout?.label ?? ""} onChange={(e) => setHandout({ label: e.target.value })} />
          <input aria-label="Handout link" placeholder="https://… (Canvas file link)" className={input} value={value.handout?.url ?? ""} onChange={(e) => setHandout({ url: e.target.value })} />
        </div>
        <Warn url={value.handout?.url} />
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Recordings</legend>
        {value.recordings.map((r, i) => (
          <div key={i} className="mt-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Part {i + 1}</span>
              <IconButton label={`Remove part ${i + 1}`} onClick={() => set({ recordings: value.recordings.filter((_, idx) => idx !== i) })}>✕</IconButton>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input aria-label={`Part ${i + 1} title`} placeholder="Title, e.g. General concepts" className={input} value={r.title ?? ""} onChange={(e) => setRecording(i, { title: e.target.value })} />
              <input aria-label={`Part ${i + 1} recording link`} placeholder="Recording link" className={input} value={r.recording_url ?? ""} onChange={(e) => setRecording(i, { recording_url: e.target.value })} />
              <input aria-label={`Part ${i + 1} transcript link`} placeholder="Transcript link" className={input} value={r.transcript_url ?? ""} onChange={(e) => setRecording(i, { transcript_url: e.target.value })} />
            </div>
            <Warn url={r.recording_url} />
            <Warn url={r.transcript_url} />
          </div>
        ))}
        <Button className="mt-2" variant="ghost" onClick={() => set({ recordings: [...value.recordings, {}] })}>+ Add recording</Button>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Additional resources</legend>
        {value.resources.map((r, i) => (
          <div key={i} className="mt-2 grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label={`Resource ${i + 1} title`} placeholder="Title" className={input} value={r.title} onChange={(e) => setResource(i, { title: e.target.value })} />
            <div>
              <input aria-label={`Resource ${i + 1} link`} placeholder="https://…" className={input} value={r.url ?? ""} onChange={(e) => setResource(i, { url: e.target.value })} />
              <Warn url={r.url} />
            </div>
            <IconButton label={`Remove resource ${i + 1}`} onClick={() => set({ resources: value.resources.filter((_, idx) => idx !== i) })}>✕</IconButton>
          </div>
        ))}
        <Button className="mt-2" variant="ghost" onClick={() => set({ resources: [...value.resources, { title: "" }] })}>+ Add resource</Button>
      </fieldset>
    </div>
  );
}
