import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, MAX_SOURCES } from "../../config";
import { Button } from "../ui/Button";

export function Dropzone({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${over ? "border-purple bg-purple-soft" : "border-line bg-limestone-soft"}`}
    >
      <p className="font-display text-2xl font-semibold">Drop your teaching material here</p>
      <p className="mt-1 font-serif text-sm text-ink-muted">
        Word, PowerPoint or PDF · up to {MAX_FILE_MB} MB each · {MAX_SOURCES} sources per page
      </p>
      <Button className="mt-4" disabled={disabled} onClick={() => input.current?.click()}>
        Choose files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
