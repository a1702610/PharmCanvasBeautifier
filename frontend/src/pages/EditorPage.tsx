import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { AddBlockMenu } from "../components/editor/AddBlockMenu";
import { CanvasPreview, type PreviewAction } from "../components/editor/CanvasPreview";
import { NotesPanel } from "../components/editor/NotesPanel";
import { StudyMaterialsForm, emptyStudy } from "../components/study/StudyMaterialsForm";
import { TabRail } from "../components/editor/TabRail";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { setAtPath } from "../render/editing";
import { buildContext, renderPage } from "../render/renderPage";
import { getPage, savePage, type SavedPage } from "../storage/db";
import { exportPageJson } from "../storage/exchange";
import { replaceTab, undoTab, usedImageRefs } from "../storage/pageOps";
import { addTab, insertBlock, newBlock, newPanel, removeItem, removeTab } from "../storage/structureOps";
import type { Block, Page, StudyMaterials } from "../types/page";
import { buildImagesZip, downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

const COPY_TIP_KEY = "pharm_canvas_copy_tip_seen";

export default function EditorPage() {
  const { id } = useParams();
  const [saved, setSaved] = useState<SavedPage | null | undefined>(undefined);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [editable, setEditable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyDraft, setStudyDraft] = useState<StudyMaterials>(emptyStudy());
  const [addMenu, setAddMenu] = useState<{ list: string; index: number; anchor: DOMRect } | null>(null);
  const [tabToDelete, setTabToDelete] = useState<number | null>(null);

  // Mirrors `saved`, but written synchronously (not via a render/effect) wherever we change
  // it, so a handler that fires right after another one just saved (e.g. Copy/Undo clicked in
  // the same browser event batch as a field's blur-triggered save) reads the up-to-date page
  // even before React has re-rendered with the new state.
  const savedRef = useRef<SavedPage | null | undefined>(saved);

  useEffect(() => {
    if (id) getPage(id).then((p) => { savedRef.current = p ?? null; setSaved(p ?? null); }).catch(() => { savedRef.current = null; setSaved(null); });
  }, [id]);

  const html = useMemo(
    () => (saved ? renderPage(saved.page, buildContext(saved.images, saved.embeds)) : ""),
    [saved],
  );
  // Preview-only render, used solely when the "Edit text" toggle is on. Copy HTML, Export
  // and the HTML view always use the non-editable `html` above.
  const previewHtml = useMemo(
    () => (saved && editable ? renderPage(saved.page, buildContext(saved.images, saved.embeds, true)) : html),
    [saved, editable, html],
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
    // Optimistic: update state (and the ref, synchronously) immediately, so the UI and any
    // handler reading savedRef right away sees the edit without waiting on IndexedDB latency.
    savedRef.current = next;
    setSaved(next);
    try {
      const stored = await savePage(next);
      savedRef.current = stored;
      setSaved(stored);
    } catch {
      toast.error("Couldn't save your change.");
      try {
        const reloaded = (await getPage(next.id)) ?? null;
        savedRef.current = reloaded;
        setSaved(reloaded);
      } catch {
        savedRef.current = null;
        setSaved(null);
      }
    }
  }

  async function copyHtml() {
    const page = savedRef.current ?? current;
    const freshHtml = renderPage(page.page, buildContext(page.images, page.embeds));
    try {
      await navigator.clipboard.writeText(freshHtml);
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

  function openStudy() {
    setStudyDraft(current.page.study ?? emptyStudy());
    setStudyOpen(true);
  }

  async function saveStudy() {
    const base = savedRef.current ?? current;
    setStudyOpen(false);
    await persist({ ...base, page: { ...base.page, study: studyDraft } });
  }

  // Structural change inside one tab (add/delete a section or panel). Goes through replaceTab
  // so ↶ can undo it, like a text edit.
  function changeTab(path: string, change: (page: Page) => Page) {
    const base = savedRef.current ?? current;
    const tabIndex = Number(path.match(/^tabs\.(\d+)\./)?.[1] ?? -1);
    const tab = base.page.tabs[tabIndex];
    let nextPage: Page;
    try {
      if (!tab) throw new Error(`No tab for ${path}`);
      nextPage = change(base.page);
    } catch {
      toast.error("Couldn't change that section.");
      return;
    }
    persist(replaceTab(base, tab.id, nextPage.tabs[tabIndex])).catch(() => toast.error("Couldn't save that change."));
  }

  function handleAction(action: PreviewAction) {
    if (action.kind === "delete") changeTab(action.path, (page) => removeItem(page, action.path));
    else if (action.kind === "add") setAddMenu({ list: action.list, index: action.index, anchor: action.anchor });
    else changeTab(action.list, (page) => insertBlock(page, action.list, action.index, newPanel()));
  }

  function addSection(type: Block["type"]) {
    const target = addMenu;
    setAddMenu(null);
    if (target) changeTab(target.list, (page) => insertBlock(page, target.list, target.index, newBlock(type)));
  }

  function handleAddTab() {
    const base = savedRef.current ?? current;
    persist({ ...base, page: addTab(base.page) }).catch(() => toast.error("Couldn't add the tab."));
    setActiveIndex(base.page.tabs.length);
    setView("preview");
    setEditable(true);
  }

  function confirmDeleteTab() {
    const index = tabToDelete;
    setTabToDelete(null);
    if (index === null) return;
    const base = savedRef.current ?? current;
    const tab = base.page.tabs[index];
    if (!tab) return;
    const history = { ...base.history };
    delete history[tab.id];
    persist({ ...base, history, page: removeTab(base.page, index) }).catch(() => toast.error("Couldn't delete the tab."));
    setActiveIndex((active) => Math.max(0, active > index ? active - 1 : Math.min(active, base.page.tabs.length - 2)));
  }

  // Synchronous (CanvasPreview needs the result right away): returns false if the edit couldn't
  // be applied, so the preview reverts the element. persist() updates state optimistically
  // before its first await, so an accepted edit is already in `saved` when this returns;
  // a later IndexedDB failure is reported and reconciled by persist() itself.
  function handleEdit(path: string, value: string): boolean {
    const base = savedRef.current ?? current;
    let next: SavedPage;
    try {
      const nextPage = setAtPath(base.page, path, value);
      const tabMatch = path.match(/^tabs\.(\d+)\./);
      const tabIndex = tabMatch ? Number(tabMatch[1]) : -1;
      const tab = base.page.tabs[tabIndex];
      // Tab edits go through replaceTab so they get an undo-history entry; intro edits don't.
      next = tab ? replaceTab(base, tab.id, nextPage.tabs[tabIndex]) : { ...base, page: nextPage };
    } catch {
      toast.error("Couldn't save that edit.");
      return false;
    }
    persist(next).catch(() => toast.error("Couldn't save that edit."));
    return true;
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
          <Button onClick={openStudy}>Study materials</Button>
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
            onUndo={(tab) => persist(undoTab(savedRef.current ?? current, tab.id)).catch(() => toast.error("Couldn't undo."))}
            onAdd={handleAddTab}
            onDelete={setTabToDelete}
          />
          <NotesPanel notes={current.page.notes} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              aria-pressed={editable}
              onClick={() => setEditable((e) => !e)}
              className={`rounded-full border border-line px-4 py-1.5 text-sm font-medium ${editable ? "bg-brightblue text-white" : "text-ink-muted hover:text-navy"}`}
            >
              Edit text
            </button>
            {editable && (
              <span className="text-xs text-ink-muted">Click any text to change it. Use + Add and × to add or remove sections.</span>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
            {view === "preview" ? (
              <CanvasPreview
                html={previewHtml}
                activeIndex={activeIndex}
                editable={editable}
                onSelect={setActiveIndex}
                onEdit={handleEdit}
                onAction={handleAction}
              />
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

      <Modal
        open={studyOpen}
        wide
        title="Study materials"
        onClose={() => setStudyOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStudyOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveStudy}>Save</Button>
          </>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <StudyMaterialsForm value={studyDraft} onChange={setStudyDraft} />
        </div>
      </Modal>
      {addMenu && (
        <AddBlockMenu
          anchor={addMenu.anchor}
          insidePanel={/\.panels\.\d+\.blocks$/.test(addMenu.list)}
          onPick={addSection}
          onClose={() => setAddMenu(null)}
        />
      )}
      <Modal
        open={tabToDelete !== null}
        title="Delete this tab?"
        onClose={() => setTabToDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTabToDelete(null)}>Cancel</Button>
            <Button variant="primary" onClick={confirmDeleteTab}>Delete tab</Button>
          </>
        }
      >
        <p className="font-serif text-sm leading-relaxed">
          “{tabToDelete !== null ? current.page.tabs[tabToDelete]?.title : ""}” and everything in it will be removed. This can't be undone.
        </p>
      </Modal>
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
