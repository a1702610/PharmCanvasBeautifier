import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { AddBlockMenu } from "../components/editor/AddBlockMenu";
import { CanvasPreview, type FocusRequest, type PreviewAction } from "../components/editor/CanvasPreview";
import { NotesPanel } from "../components/editor/NotesPanel";
import { StudyMaterialsForm, emptyStudy } from "../components/study/StudyMaterialsForm";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { setAtPath } from "../render/editing";
import { buildContext, renderPage } from "../render/renderPage";
import { getPage, savePage, type SavedPage } from "../storage/db";
import { exportPageJson } from "../storage/exchange";
import { replaceTab, undoTab, usedImageRefs } from "../storage/pageOps";
import {
  addColumn,
  addTab,
  moveTab,
  insertBlock,
  newBlock,
  newListItem,
  newPanel,
  paragraphLinesToBlocks,
  removeColumn,
  removeEmpty,
  removeItem,
  removeTab,
  splitText,
} from "../storage/structureOps";
import type { Block, Page, StudyMaterials } from "../types/page";
import { buildImagesZip, downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

const COPY_TIP_KEY = "pharm_canvas_copy_tip_seen";

export default function EditorPage() {
  const { id } = useParams();
  const [saved, setSaved] = useState<SavedPage | null | undefined>(undefined);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [activeIndex, setActiveIndex] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyDraft, setStudyDraft] = useState<StudyMaterials>(emptyStudy());
  const [addMenu, setAddMenu] = useState<{ list: string; index: number; anchor: DOMRect } | null>(null);
  const [tabToDelete, setTabToDelete] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusRequestId = useRef(0);

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
  // The preview is always editable (data-edit paths and add/delete controls). Copy HTML,
  // Export and the HTML view always use the clean `html` above.
  const previewHtml = useMemo(
    () => (saved ? renderPage(saved.page, buildContext(saved.images, saved.embeds, true)) : ""),
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

  // Structural change (add/delete a section, panel, point, row, column…) at `path`. Changes
  // inside a tab go through replaceTab so ↶ can undo them, like a text edit; the Revision
  // check's points aren't part of a tab, so those are saved directly.
  function changeStructure(path: string, change: (page: Page) => Page) {
    const base = savedRef.current ?? current;
    const tabMatch = path.match(/^tabs\.(\d+)\./);
    const tabIndex = tabMatch ? Number(tabMatch[1]) : -1;
    const tab = base.page.tabs[tabIndex];
    let next: SavedPage;
    try {
      if (tabMatch && !tab) throw new Error(`No tab for ${path}`);
      const nextPage = change(base.page);
      next = tab ? replaceTab(base, tab.id, nextPage.tabs[tabIndex]) : { ...base, page: nextPage };
    } catch {
      toast.error("Couldn't make that change.");
      return;
    }
    persist(next).catch(() => toast.error("Couldn't save that change."));
  }

  function handleAction(action: PreviewAction) {
    switch (action.kind) {
      case "add":
        setAddMenu({ list: action.list, index: action.index, anchor: action.anchor });
        return;
      case "add-panel":
        return changeStructure(action.list, (page) => insertBlock(page, action.list, action.index, newPanel()));
      case "add-item":
        return changeStructure(action.list, (page) => insertBlock(page, action.list, action.index, newListItem(page, action.list)));
      case "add-column":
        return changeStructure(action.path, (page) => addColumn(page, action.path));
      case "delete-column":
        return changeStructure(action.path, (page) => removeColumn(page, action.path, action.index));
      case "delete":
        return changeStructure(action.path, (page) => removeItem(page, action.path));
      case "split":
        return typingChange(action.path, (page) => splitText(page, action.path, action.before, action.after));
      case "to-list":
        return typingChange(action.path, (page) => paragraphLinesToBlocks(page, action.path, action.text, action.caretLine));
      case "remove-empty":
        return typingChange(action.path, (page) => removeEmpty(page, action.path));
      case "add-tab":
        return handleAddTab();
      case "delete-tab":
        setTabToDelete(action.index);
        return;
      case "move-tab": {
        const base = savedRef.current ?? current;
        const to = action.index + action.dir;
        if (to < 0 || to >= base.page.tabs.length) return;
        persist({ ...base, page: moveTab(base.page, action.index, action.dir) }).catch(() => toast.error("Couldn't move the tab."));
        // Keep the moved tab (or the one it swapped with) selected where the user is looking.
        setActiveIndex((active) => (active === action.index ? to : active === to ? action.index : active));
        return;
      }
    }
  }

  // Enter / "- " / Backspace while typing: a structural change, then the caret moves to the
  // field the change says (e.g. the new paragraph).
  function typingChange(path: string, change: (page: Page) => { page: Page; focus?: { path: string; caret: "start" | "end" } }) {
    let focus: { path: string; caret: "start" | "end" } | undefined;
    changeStructure(path, (page) => {
      const result = change(page);
      focus = result.focus;
      return result.page;
    });
    if (focus) setFocusRequest({ ...focus, id: ++focusRequestId.current });
  }

  function addSection(type: Block["type"]) {
    const target = addMenu;
    setAddMenu(null);
    if (target) changeStructure(target.list, (page) => insertBlock(page, target.list, target.index, newBlock(type)));
  }

  function handleAddTab() {
    const base = savedRef.current ?? current;
    persist({ ...base, page: addTab(base.page) }).catch(() => toast.error("Couldn't add the tab."));
    setActiveIndex(base.page.tabs.length);
    setView("preview");
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
      // The page title is also the saved page's name (My pages, the editor heading).
      if (path === "title") next = { ...next, title: nextPage.title };
    } catch {
      toast.error("Couldn't save that edit.");
      return false;
    }
    persist(next).catch(() => toast.error("Couldn't save that edit."));
    return true;
  }

  // ↶ undoes the last change to the tab being viewed (Study materials / Revision check have none).
  const activeTab = current.page.tabs[activeIndex];
  const canUndo = !!activeTab && (current.history[activeTab.id]?.length ?? 0) > 0;
  function undoActiveTab() {
    if (activeTab) persist(undoTab(savedRef.current ?? current, activeTab.id)).catch(() => toast.error("Couldn't undo."));
  }

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
            <Button onClick={undoActiveTab} disabled={!canUndo} title={activeTab ? `Undo the last change to "${activeTab.title}"` : undefined}>
              ↶ Undo
            </Button>
            <span className="text-xs text-ink-muted">Click any text to change it. Enter starts a new paragraph or point; type "- " for a bullet list. Use + Add and × to add or remove sections, rows, columns, points and tabs, and ↑ ↓ on a tab to move it.</span>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
            {view === "preview" ? (
              <CanvasPreview
                html={previewHtml}
                activeIndex={activeIndex}
                editable
                onSelect={setActiveIndex}
                onEdit={handleEdit}
                onAction={handleAction}
                focusRequest={focusRequest}
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
