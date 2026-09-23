import { Spinner } from "../ui/Spinner";

export type Stage = "idle" | "reading" | "structuring" | "building";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "reading", label: "Reading files" },
  { stage: "structuring", label: "Structuring content" },
  { stage: "building", label: "Building page" },
];

export function GenerateProgress({ stage }: { stage: Stage }) {
  const current = STEPS.findIndex((s) => s.stage === stage);
  return (
    <ol className="mt-5 space-y-2" aria-live="polite">
      {STEPS.map((step, i) => (
        <li
          key={step.stage}
          className={`flex items-center gap-3 text-sm ${i < current ? "text-emerald-700" : i === current ? "font-semibold text-navy" : "text-ink-muted"}`}
        >
          {i < current ? <span className="w-4 text-center">✓</span> : i === current ? <Spinner /> : <span className="h-4 w-4 rounded-full border border-line" />}
          {step.label}
          {i === current && step.stage === "structuring" && <span className="font-normal text-ink-muted">(this can take a minute)</span>}
        </li>
      ))}
    </ol>
  );
}
