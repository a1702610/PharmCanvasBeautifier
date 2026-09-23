import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import CreatePage from "./pages/CreatePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CreatePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
