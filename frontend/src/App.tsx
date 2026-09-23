import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import CreatePage from "./pages/CreatePage";
import EditorPage from "./pages/EditorPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CreatePage />} />
          <Route path="pages/:id" element={<EditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
