import type { SourceInput, SourceStatus } from "../../types/api";
import { formatSize } from "../../utils/format";
import { IconButton } from "../ui/IconButton";

const KIND_LABEL = { docx: "Word", pptx: "PowerPoint", pdf: "PDF", canvas: "Canvas" } as const;

function kindOf(source: SourceInput): keyof typeof KIND_LABEL {
  if (source.kind === "canvas") return "canvas";
  const ext = source.file.name.split(".").pop()?.toLowerCase();
  return ext === "docx" || ext === "pptx" ? ext : "pdf";
}

interface Props {
  sources: SourceInput[];
  statuses: Record<string, SourceStatus>;
  disabled: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}

export function SourceList({ sources, statuses, disabled, onMove, onRemove }: Props) {
  if (!sources.length) return null;
  return (
    <ol className="mt-5 space-y-2">
      {sources.map((source, i) => {
        const status = statuses[source.id];
        return (
          <li key={source.id} className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <span className="mt-0.5 w-5 text-sm font-semibold text-ink-muted">{i + 1}</span>
            <span className="mt-0.5 rounded-md bg-limestone px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
              {KIND_LABEL[kindOf(source)]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{source.kind === "file" ? source.file.name : source.label}</p>
              <p className="text-xs text-ink-muted">
                {source.kind === "file" ? formatSize(source.file.size) : `${source.html.length.toLocaleString()} characters of HTML`}
              </p>
              {status && !status.ok && <p className="mt-1 text-xs text-red-700">✕ {status.error}</p>}
              {status?.ok && status.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-700">{w}</p>)}
            </div>
            {status?.ok && <span className="mt-0.5 text-sm text-emerald-700" aria-label="Read successfully">✓</span>}
            <div className="flex items-center">
              <IconButton label="Move up" disabled={disabled || i === 0} onClick={() => onMove(i, -1)}>↑</IconButton>
              <IconButton label="Move down" disabled={disabled || i === sources.length - 1} onClick={() => onMove(i, 1)}>↓</IconButton>
              <IconButton label="Remove" disabled={disabled} onClick={() => onRemove(source.id)}>✕</IconButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
