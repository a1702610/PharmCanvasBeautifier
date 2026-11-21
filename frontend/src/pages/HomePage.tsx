import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { newSavedPage, savePage } from "../storage/db";
import { blankPage } from "../storage/structureOps";

const CARD =
  "flex aspect-square flex-col rounded-3xl border p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-purple sm:p-10";

export default function HomePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function buildManually() {
    setBusy(true);
    try {
      const saved = await savePage(newSavedPage({ page: blankPage(), sourceText: "", images: [], embeds: [] }));
      navigate(`/pages/${saved.id}`);
    } catch {
      toast.error("Couldn't create the page. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-5xl font-bold tracking-tight">Create a Canvas page</h1>
      <p className="mt-2 max-w-2xl font-serif text-ink-muted">
        Every page uses the shared pharmacy template, ready to paste into Canvas. Choose how you want to start.
      </p>

      <div className="mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
        <Link to="/create" className={`${CARD} border-line bg-limestone-soft`}>
          <span aria-hidden="true" className="text-4xl">✦</span>
          <span className="mt-6 font-display text-3xl font-bold text-navy">Use AI</span>
          <span className="mt-3 font-serif text-ink-muted">
            Upload your Word, PowerPoint or PDF files (or an old Canvas page) and Gemini restructures them into the template.
          </span>
          <span className="mt-auto rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            AI can be hit or miss with transferring all your content: it may leave out, merge or reword parts. Always check the
            page against your original material.
          </span>
        </Link>

        <button type="button" onClick={buildManually} disabled={busy} className={`${CARD} border-line bg-purple-soft disabled:opacity-60`}>
          <span aria-hidden="true" className="text-4xl">✎</span>
          <span className="mt-6 font-display text-3xl font-bold text-navy">Build it manually</span>
          <span className="mt-3 font-serif text-ink-muted">
            Start from a blank page in the same template and add your own sections: paragraphs, tables, callouts, check your
            understanding and more.
          </span>
          <span className="mt-auto text-sm font-medium text-navy">{busy ? "Creating…" : "No API key needed →"}</span>
        </button>
      </div>
    </div>
  );
}
