import { useState } from "react";
import toast from "react-hot-toast";
import { extractSources } from "../../api/endpoints";
import { checkFile } from "../../config";
import { cleanOutlineText, type Course } from "../../storage/courses";
import { Spinner } from "../ui/Spinner";

const field = "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30";

export function CourseForm({ course, onChange }: { course: Course; onChange: (c: Course) => void }) {
  const [reading, setReading] = useState(false);
  const set = (patch: Partial<Course>) => onChange({ ...course, ...patch });

  async function fromFile(file: File) {
    const error = checkFile(file, 0);
    if (error) {
      toast.error(error);
      return;
    }
    setReading(true);
    try {
      const result = await extractSources([{ id: crypto.randomUUID(), kind: "file", file }]);
      if (!result.sources[0]?.ok) {
        toast.error(result.sources[0]?.error ?? "That file couldn't be read.");
        return;
      }
      onChange({ ...course, outline: cleanOutlineText(result.text), outlineSource: file.name });
    } catch {
      toast.error("That file couldn't be read.");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="font-medium">Code
          <input className={field} value={course.code} onChange={(e) => set({ code: e.target.value })} placeholder="PHAR3004" />
        </label>
        <label className="font-medium sm:col-span-2">Name
          <input className={field} value={course.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
      </div>
      <label className="block font-medium">Year level
        <input className={field} value={course.level} onChange={(e) => set({ level: e.target.value })} placeholder="e.g. Year 3" />
      </label>
      <label className="block font-medium">Aims
        <textarea rows={3} className={field} value={course.aims} onChange={(e) => set({ aims: e.target.value })} />
      </label>
      <label className="block font-medium">Learning outcomes <span className="font-normal text-ink-muted">(one per line)</span>
        <textarea rows={4} className={field} value={course.outcomes} onChange={(e) => set({ outcomes: e.target.value })} />
      </label>
      <label className="block font-medium">Notes
        <textarea rows={3} className={field} value={course.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <div>
        <label className="block font-medium">Fill from course outline (Word or PDF)
          <input
            type="file"
            accept=".docx,.pdf"
            disabled={reading}
            className="mt-1 block text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void fromFile(f);
            }}
          />
        </label>
        {reading && <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted"><Spinner /> Reading…</p>}
      </div>
      <label className="block font-medium">Course outline
        {course.outlineSource && <span className="ml-2 text-xs font-normal text-ink-muted">from {course.outlineSource}</span>}
        <textarea rows={8} className={field} value={course.outline} onChange={(e) => set({ outline: e.target.value })} />
      </label>
    </div>
  );
}
