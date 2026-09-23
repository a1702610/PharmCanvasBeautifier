import axios from "axios";

export const API_KEY_STORAGE = "pharm_canvas_gemini_key";

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    // storage unavailable (private mode); key lives only for this session's requests
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // ignore
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL
  ? `${String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, "")}/api`
  : "/api";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const key = getApiKey();
  if (key) config.headers["X-Gemini-Key"] = key;
  return config;
});

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
    return err.response.data.detail;
  }
  return fallback;
}
