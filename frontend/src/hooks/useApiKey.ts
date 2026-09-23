import { useCallback, useEffect, useState } from "react";
import { clearApiKey, getApiKey, setApiKey } from "../api/client";

const EVENT = "pharm-canvas-api-key";

export function useApiKey(): [string, (key: string) => void, () => void] {
  const [key, setKey] = useState(getApiKey);

  useEffect(() => {
    const sync = () => setKey(getApiKey());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const save = useCallback((next: string) => {
    setApiKey(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [key, save, clear];
}
