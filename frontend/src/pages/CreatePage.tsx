import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { extractSources, generatePage } from "../api/endpoints";
import { Dropzone } from "../components/create/Dropzone";
import { GenerateProgress, type Stage } from "../components/create/GenerateProgress";
import { PasteCanvasModal } from "../components/create/PasteCanvasModal";
import { SourceList } from "../components/create/SourceList";
import { CourseManagerModal } from "../components/courses/CourseManagerModal";
import { emptyStudy, StudyMaterialsForm } from "../components/study/StudyMaterialsForm";
import { Button } from "../components/ui/Button";
import { checkFile, checkPaste, MAX_SOURCES } from "../config";
import { useApiKey } from "../hooks/useApiKey";
import { buildCourseContext, listCourses, type Course } from "../storage/courses";
import { newSavedPage, savePage } from "../storage/db";
import { imagesForAI, sourceNotes } from "../storage/pageOps";
import type { ExtractResult, SourceInput, SourceStatus } from "../types/api";
import type { StudyMaterials } from "../types/page";

export default function CreatePage() {
  const navigate = useNavigate();
  const [apiKey] = useApiKey();
  const [sources, setSources] = useState<SourceInput[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  const [title, setTitle] = useState("");
  const [includeRevision, setIncludeRevision] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [largeExtract, setLargeExtract] = useState<ExtractResult | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [courseManagerOpen, setCourseManagerOpen] = useState(false);
  const [study, setStudy] = useState<StudyMaterials>(emptyStudy());
  const [studyOpen, setStudyOpen] = useState(false);
  const busy = stage !== "idle";

  const loadCourses = useCallback(() => {
    listCourses().then(setCourses).catch(() => toast.error("Couldn't load your courses."));
  }, []);
  useEffect(loadCourses, [loadCourses]);

  function addFiles(files: File[]) {
    const next = [...sources];
    for (const file of files) {
      const error = checkFile(file, next.length);
      if (error) {
        toast.error(error);
        continue;
      }
      next.push({ id: crypto.randomUUID(), kind: "file", file });
    }
    setSources(next);
    setLargeExtract(null);
  }

  function addCanvas(html: string) {
    if (sources.length >= MAX_SOURCES) {
      toast.error(`You can add up to ${MAX_SOURCES} sources per page.`);
      return;
    }
    const pasteError = checkPaste(html);
    if (pasteError) {
      toast.error(pasteError);
      return;
    }
    const n = sources.filter((s) => s.kind === "canvas").length + 1;
    setSources([...sources, { id: crypto.randomUUID(), kind: "canvas", html, label: `Pasted Canvas page ${n}` }]);
    setLargeExtract(null);
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...sources];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setSources(next);
    setLargeExtract(null);
  }

  function remove(id: string) {
    setSources(sources.filter((s) => s.id !== id));
    setLargeExtract(null);
  }

  async function generate(existing?: ExtractResult) {
    try {
      let result = existing;
      if (!result) {
        setStage("reading");
        setStatuses({});
        const extracted = await extractSources(sources);
        setStatuses(Object.fromEntries(sources.map((s, i) => [s.id, extracted.sources[i]])));
        if (!extracted.sources.some((s) => s.ok)) {
          toast.error("None of the sources could be read.");
          setStage("idle");
          return;
        }
        if (extracted.approx_tokens > extracted.token_limit) {
          setLargeExtract(extracted);
          setStage("idle");
          return;
        }
        result = extracted;
      }
      setLargeExtract(null);
      setStage("structuring");
      const course = courses.find((c) => c.id === courseId);
      const { page } = await generatePage({
        text: result.text,
        images: imagesForAI(result.images),
        instructions,
        include_revision: includeRevision,
        title,
        course_context: buildCourseContext(course),
      });
      setStage("building");
      const notes = sourceNotes(result.sources);
      const withNotes = notes.length ? { ...page, notes: [...page.notes, ...notes] } : page;
      const pageWithNotes = { ...withNotes, study };
      const saved = await savePage({
        ...newSavedPage({ page: pageWithNotes, sourceText: result.text, images: result.images, embeds: result.embeds }),
        courseId: course?.id,
      });
      navigate(`/pages/${saved.id}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Something went wrong. Please try again."));
      setStage("idle");
    }
  }

  return (
    <div>
      <h1 className="font-display text-5xl font-bold tracking-tight">Create a Canvas page</h1>
      <p className="mt-2 max-w-2xl font-serif text-ink-muted">
        Add your lecture material, and PharmCanvas will restructure it into the pharmacy house style, ready to paste into Canvas.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="sources-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="sources-heading" className="font-display text-2xl font-semibold">Sources</h2>
            <Button variant="ghost" disabled={busy} onClick={() => setPasteOpen(true)}>+ Paste Canvas page HTML</Button>
          </div>
          <div className="mt-3">
            <Dropzone onFiles={addFiles} disabled={busy} />
          </div>
          <SourceList sources={sources} statuses={statuses} disabled={busy} onMove={move} onRemove={remove} />

          <div className="mt-6 rounded-2xl border border-line">
            <button
              type="button"
              aria-expanded={studyOpen}
              onClick={() => setStudyOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-display text-lg font-semibold"
            >
              Study materials (optional)
              <span aria-hidden="true">{studyOpen ? "−" : "+"}</span>
            </button>
            {studyOpen && (
              <div className="border-t border-line p-4">
                <StudyMaterialsForm value={study} onChange={setStudy} />
              </div>
            )}
          </div>
        </section>

        <aside className="h-fit rounded-2xl bg-limestone p-6" aria-labelledby="options-heading">
          <h2 id="options-heading" className="font-display text-2xl font-semibold">Page options</h2>
          <div className="mt-4">
            <label className="block text-sm font-medium">
              Course <span className="font-normal text-ink-muted">(optional)</span>
              <select
                aria-label="Course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
              >
                <option value="">No course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{[c.code, c.name].filter(Boolean).join(" — ")}</option>
                ))}
              </select>
            </label>
            <Button variant="ghost" className="mt-1" disabled={busy} onClick={() => setCourseManagerOpen(true)}>Manage courses</Button>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Page title <span className="font-normal text-ink-muted">(optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="e.g. Chronic non-cancer pain"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
            />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={includeRevision} onChange={(e) => setIncludeRevision(e.target.checked)} disabled={busy} className="h-4 w-4 accent-purple" />
            Include revision block
          </label>
          <label className="mt-4 block text-sm font-medium">
            Instructions <span className="font-normal text-ink-muted">(optional)</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="e.g. Focus on counselling points"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-serif text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
            />
          </label>

          {largeExtract ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-semibold text-amber-900">This is a lot of material</p>
              <p className="mt-1 text-amber-900">
                About {largeExtract.approx_tokens.toLocaleString()} tokens, over the recommended {largeExtract.token_limit.toLocaleString()}. Splitting it into several pages usually gives better results.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={() => generate(largeExtract)}>Generate anyway</Button>
                <Button variant="ghost" onClick={() => setLargeExtract(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" className="mt-6 w-full py-3 text-base" disabled={!sources.length || !apiKey || busy} onClick={() => generate()}>
              {busy ? "Working…" : "Generate page"}
            </Button>
          )}
          {!apiKey && <p className="mt-2 text-xs text-ink-muted">Add your Gemini key with Insert API Key (top right) first.</p>}
          {busy && <GenerateProgress stage={stage} />}
        </aside>
      </div>

      <CourseManagerModal
        open={courseManagerOpen}
        onClose={() => setCourseManagerOpen(false)}
        onChanged={() => {
          loadCourses();
        }}
      />
      <PasteCanvasModal open={pasteOpen} onClose={() => setPasteOpen(false)} onAdd={addCanvas} />
    </div>
  );
}
