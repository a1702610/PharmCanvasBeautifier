import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { regenerateTab } from "../api/endpoints";
import { CanvasPreview } from "../components/editor/CanvasPreview";
import { NotesPanel } from "../components/editor/NotesPanel";
import { RegenerateDialog } from "../components/editor/RegenerateDialog";
import { TabRail } from "../components/editor/TabRail";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { buildContext, renderPage } from "../render/renderPage";
import { getPage, savePage, type SavedPage } from "../storage/db";
import { exportPageJson } from "../storage/exchange";
import { imagesForAI, replaceTab, undoTab, usedImageRefs } from "../storage/pageOps";
import type { Tab } from "../types/page";
import { buildImagesZip, downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

const COPY_TIP_KEY = "pharm_canvas_copy_tip_seen";

export default function EditorPage() {
  const { id } = useParams();
  const [saved, setSaved] = useState<SavedPage | null | undefined>(undefined);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [activeIndex, setActiveIndex] = useState(0);
  const [regenTarget, setRegenTarget] = useState<Tab | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (id) getPage(id).then((p) => setSaved(p ?? null));
  }, [id]);

  const html = useMemo(
    () => (saved ? renderPage(saved.page, buildContext(saved.images, saved.embeds)) : ""),
    [saved],
  );
  const downloadableRefs = useMemo(
    () => (saved ? usedImageRefs(saved.page).filter((ref) => saved.images.some((i) => i.ref === ref && i.data_b64)) : []),
    [saved],
  );

  if (saved === undefined) return <p className="text-ink-muted">Loading…</p>;
  if (saved === null) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Page not found</h1>
        <p className="mt-2 font-serif text-ink-muted">This page isn't saved in this browser.</p>
        <Link to="/pages" className="mt-4 inline-block text-brightblue underline">Go to My pages</Link>
      </div>
    );
  }
  const current = saved;

  async function persist(next: SavedPage) {
    setSaved(await savePage(next));
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      toast.error("Couldn't copy. Switch to the HTML view and copy it manually.");
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(COPY_TIP_KEY) === "1";
      localStorage.setItem(COPY_TIP_KEY, "1");
    } catch {
      // storage unavailable: show the tip every time
    }
    if (seen) toast.success("HTML copied");
    else setTipOpen(true);
  }

  async function downloadImages() {
    const blob = await buildImagesZip(current.images, downloadableRefs);
    if (blob) downloadBlob(blob, `${safeFilename(current.title)}-images.zip`);
  }

  function exportPage() {
    downloadBlob(new Blob([exportPageJson(current)], { type: "application/json" }), `${safeFilename(current.title)}.json`);
  }

  async function submitRegenerate(instruction: string) {
    if (!regenTarget) return;
    setRegenBusy(true);
    try {
      const result = await regenerateTab({
        text: current.sourceText,
        images: imagesForAI(current.images),
        outline: { intro: current.page.intro, tab_titles: current.page.tabs.map((t) => t.title) },
        tab: regenTarget,
        instruction,
      });
      await persist(replaceTab(current, regenTarget.id, result.tab, result.notes));
      setRegenTarget(null);
      toast.success("Tab regenerated");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Regeneration failed. Please try again."));
    } finally {
      setRegenBusy(false);
    }
  }

  const historyCounts = Object.fromEntries(Object.entries(current.history).map(([k, v]) => [k, v.length]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{current.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">Saved in this browser · {formatDate(current.updatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {downloadableRefs.length > 0 && <Button onClick={downloadImages}>Images ⤓</Button>}
          <Button onClick={exportPage}>Export</Button>
          <Button variant="primary" onClick={copyHtml}>Copy HTML</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <TabRail
            tabs={current.page.tabs}
            activeIndex={activeIndex}
            historyCounts={historyCounts}
            onSelect={(i) => { setActiveIndex(i); setView("preview"); }}
            onRegenerate={setRegenTarget}
            onUndo={(tab) => persist(undoTab(current, tab.id))}
          />
          <NotesPanel notes={current.page.notes} />
        </div>

        <div className="min-w-0">
          <div role="tablist" aria-label="View" className="inline-flex rounded-full border border-line p-1">
            {(["preview", "html"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${view === v ? "bg-navy text-white" : "text-ink-muted hover:text-navy"}`}
              >
                {v === "preview" ? "Preview" : "HTML"}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
            {view === "preview" ? (
              <CanvasPreview html={html} activeIndex={activeIndex} onSelect={setActiveIndex} />
            ) : (
              <pre className="max-h-[70vh] overflow-auto rounded-xl bg-limestone-soft p-5 font-mono text-xs leading-relaxed text-navy">
                <code>{html}</code>
              </pre>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            The preview approximates Canvas. The tabs use DesignPLUS, which only renders fully inside Canvas.
          </p>
        </div>
      </div>

      <RegenerateDialog tab={regenTarget} busy={regenBusy} onClose={() => setRegenTarget(null)} onSubmit={submitRegenerate} />
      <Modal open={tipOpen} title="HTML copied" onClose={() => setTipOpen(false)} footer={<Button variant="primary" onClick={() => setTipOpen(false)}>Got it</Button>}>
        <ol className="list-decimal space-y-1 pl-5 font-serif text-sm leading-relaxed">
          <li>In Canvas, open the page and click <strong>Edit</strong>.</li>
          <li>Click the <code>&lt;/&gt;</code> button to open the HTML editor.</li>
          <li>Paste, then click <strong>Save</strong>.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-muted">Pasting into the normal visual editor can mangle the layout.</p>
      </Modal>
    </div>
  );
}
