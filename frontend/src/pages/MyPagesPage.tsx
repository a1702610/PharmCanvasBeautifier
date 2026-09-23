import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { deletePage, duplicatePage, getPage, listPages, renamePage, savePage, type PageSummary } from "../storage/db";
import { exportPageJson, parseImportedPage } from "../storage/exchange";
import { downloadBlob, safeFilename } from "../utils/downloads";
import { formatDate } from "../utils/format";

export default function MyPagesPage() {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setPages(await listPages()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitRename(id: string) {
    if (draft.trim()) await renamePage(id, draft.trim());
    setRenaming(null);
    await refresh();
  }

  async function exportOne(id: string) {
    const page = await getPage(id);
    if (page) downloadBlob(new Blob([exportPageJson(page)], { type: "application/json" }), `${safeFilename(page.title)}.json`);
  }

  async function importFile(file: File) {
    try {
      await savePage(parseImportedPage(await file.text()));
      toast.success("Page imported");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight">My pages</h1>
          <p className="mt-2 font-serif text-ink-muted">Pages are saved in this browser. Export a page to back it up or share it with a colleague.</p>
        </div>
        <Button onClick={() => fileInput.current?.click()}>Import page</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {pages === null ? (
        <p className="mt-10 text-ink-muted">Loading…</p>
      ) : pages.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-limestone-soft p-10 text-center">
          <p className="font-display text-2xl font-semibold">No pages yet</p>
          <Link to="/" className="mt-3 inline-block text-brightblue underline">Create your first page</Link>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <li key={p.id} className="flex flex-col rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
              {renaming === p.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void submitRename(p.id); }} className="flex gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line px-3 py-1.5 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
                  />
                  <Button type="submit" variant="primary">Save</Button>
                </form>
              ) : (
                <Link to={`/pages/${p.id}`} className="font-display text-2xl font-semibold leading-tight hover:text-brightblue">
                  {p.title}
                </Link>
              )}
              <p className="mt-1 text-xs text-ink-muted">{p.tabCount} tabs · Updated {formatDate(p.updatedAt)}</p>
              <div className="mt-auto flex flex-wrap gap-1 pt-4">
                <Button variant="ghost" onClick={() => { setRenaming(p.id); setDraft(p.title); }}>Rename</Button>
                <Button variant="ghost" onClick={async () => { await duplicatePage(p.id); await refresh(); }}>Duplicate</Button>
                <Button variant="ghost" onClick={() => exportOne(p.id)}>Export</Button>
                {confirmDelete === p.id ? (
                  <Button variant="danger" onClick={async () => { await deletePage(p.id); setConfirmDelete(null); await refresh(); }}>
                    Confirm delete
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmDelete(p.id)}>Delete</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
