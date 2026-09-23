import { Toaster } from "react-hot-toast";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { ServerStatusBanner } from "./ServerStatusBanner";

export function Layout() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <ServerStatusBanner />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: "14px", color: "#140f50" } }} />
    </div>
  );
}
