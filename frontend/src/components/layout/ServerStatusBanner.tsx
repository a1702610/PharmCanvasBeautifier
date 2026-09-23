import { useEffect, useState } from "react";
import { checkHealth } from "../../api/endpoints";
import { Spinner } from "../ui/Spinner";

type State = "checking" | "slow" | "ok" | "down";
const GIVE_UP_MS = 90_000;

export function ServerStatusBanner() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let done = false;
    const started = Date.now();
    const slowTimer = setTimeout(() => { if (!done) setState("slow"); }, 1500);
    (async () => {
      while (!done) {
        try {
          await checkHealth();
          done = true;
          setState("ok");
        } catch {
          if (Date.now() - started > GIVE_UP_MS) {
            done = true;
            setState("down");
          } else {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    })();
    return () => { done = true; clearTimeout(slowTimer); };
  }, []);

  if (state === "slow") {
    return (
      <div className="flex items-center justify-center gap-3 bg-limestone px-6 py-2 text-sm text-navy">
        <Spinner /> Waking up the server (up to a minute)…
      </div>
    );
  }
  if (state === "down") {
    return (
      <div className="bg-red-50 px-6 py-2 text-center text-sm text-red-800">
        Can't reach the server. Try refreshing the page in a minute.
      </div>
    );
  }
  return null;
}
