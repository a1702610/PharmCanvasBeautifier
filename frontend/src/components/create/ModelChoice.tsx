export type ModelChoiceValue = "flash" | "pro";

const STORAGE_KEY = "pharm_canvas_model";

/** The model picked last time in this browser (Flash unless Pro was chosen). */
export function loadModelChoice(): ModelChoiceValue {
  try {
    return localStorage.getItem(STORAGE_KEY) === "pro" ? "pro" : "flash";
  } catch {
    return "flash";
  }
}

export function saveModelChoice(value: ModelChoiceValue) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

const OPTIONS: { value: ModelChoiceValue; label: string; detail: string }[] = [
  {
    value: "flash",
    label: "Flash (recommended)",
    detail: "Fast and works with a free Gemini key. Good for most pages, but on long, detailed slide decks it can shorten or leave out content.",
  },
  {
    value: "pro",
    label: "Pro",
    detail:
      "More thorough with long or detailed material, and less likely to merge or reword facts. Slower, and needs a key with billing turned on (Google has no free tier for Pro), roughly US$0.30–0.50 for a 60-slide deck.",
  },
];

export function ModelChoice({ value, onChange, disabled }: { value: ModelChoiceValue; onChange: (value: ModelChoiceValue) => void; disabled?: boolean }) {
  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-sm font-medium">AI model</legend>
      <div className="mt-1 space-y-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-xl border bg-white p-3 text-sm ${value === option.value ? "border-purple ring-2 ring-purple/30" : "border-line"}`}
          >
            <input
              type="radio"
              name="ai-model"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 accent-purple"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
