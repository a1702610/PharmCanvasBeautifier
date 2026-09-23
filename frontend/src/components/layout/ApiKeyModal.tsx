import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useApiKey } from "../../hooks/useApiKey";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function ApiKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, save, clear] = useApiKey();
  const [value, setValue] = useState(key);

  useEffect(() => {
    if (open) setValue(key);
  }, [open, key]);

  return (
    <Modal
      open={open}
      title="Gemini API key"
      onClose={onClose}
      footer={
        <>
          {key && (
            <Button variant="ghost" onClick={() => { clear(); toast.success("Key removed"); onClose(); }}>
              Remove key
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!value.trim()}
            onClick={() => { save(value.trim()); toast.success("Key saved in this browser"); onClose(); }}
          >
            Save key
          </Button>
        </>
      }
    >
      <p className="font-serif text-sm leading-relaxed text-ink-muted">
        PharmCanvas uses your own Gemini key. It's saved only in this browser and sent with each request. It's never stored on the server.
      </p>
      <label className="mt-4 block text-sm font-medium">
        API key
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-mono text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/30"
        />
      </label>
      <p className="mt-3 text-sm text-ink-muted">
        No key yet? Create one free at{" "}
        <a className="text-brightblue underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
          aistudio.google.com/apikey
        </a>
        .
      </p>
    </Modal>
  );
}
