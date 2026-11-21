# PharmCanvas

Turns pharmacy lecture material (Word, PowerPoint, PDF, or an old Canvas page) into a Canvas page in the shared pharmacy house style, ready to paste into Canvas.

## Using the hosted app

1. Open the app link you were given.
2. On the home page choose how to start:
   - **Use AI:** Gemini restructures your files into the template (steps 3–4). It can be hit or miss with transferring all your content, so always check the result against your originals.
   - **Build it manually:** opens a blank page in the same template. Add sections yourself (step 5); no API key needed.
3. **Create with AI:** click **Insert API Key** (top right) and paste a Gemini API key (get one free at https://aistudio.google.com/apikey; it stays in your browser). Drop in your files, or click **Paste Canvas page HTML** to bring in an old page. Reorder them with the arrows, then click **Generate page**. For slide decks, upload a **PDF** (in PowerPoint: File → Save As → PDF): the AI then also reads the tables, charts and flowcharts inside each slide, not just the text. The first request of the day can take up to a minute while the server wakes up.
   - **AI model:** **Flash** (default) is fast and works with a free key. **Pro** is more thorough with long or detailed material but slower, and needs a Gemini key with billing turned on (Google has no free tier for Pro). Your choice is remembered in this browser.
   - **Course:** pick a saved course so the AI pitches the page at the right level. Click **Manage courses** to add one: type the details, or use **Fill from course outline** to read a Word or PDF outline. Use export/import to move a course between computers or share it with a co-teacher.
   - **Study materials (optional):** open this section to add the handout, recording and transcript links, and any extra resources. You can also do this later with the **Study materials** button in the editor toolbar. Links you leave out show as `[Add … link]` placeholders on the page.
4. **Review:** pages follow the shared pharmacy template: an intro panel, numbered tabs with collapsible sections, a "Study materials" tab, and a final "Revision check" tab. Click through the tabs in the preview. Read **Notes for you**: these are things to check, such as images to upload, content the AI flagged, and any slides or pages it didn't account for (or left out, with its reason).
5. **Edit:** click any text in the preview to change it, including the page title and tab names. Press Enter for a new paragraph or bullet point, type `- ` at the start of a paragraph to make a bullet list, and Shift+Enter for a line break. Use **+ Add** between sections to insert a new one (paragraph, table, callout, check your understanding…) and **×** to delete one. The same buttons add or remove bullet points, table rows and columns, questions, flow steps and revision points. Hover a tab button to move it (↑ ↓) or delete it (×), and use **+ Add tab** below the tabs. **↶ Undo** undoes the last change to the tab you are viewing.
6. **Images:** click **Images ⤓** to download the images the page uses (`IMG-01.png`…). Upload them to Canvas and replace each dashed `[ IMAGE IMG-nn: … ]` placeholder.
7. **Copy HTML**, then in Canvas: **Edit** → `</>` (HTML editor) → paste → **Save**.

Pages are saved in your browser under **My pages**. Use **Export** to back one up or send it to a colleague, who can **Import** it.

## Running it on your own computer

Install Python 3.13 (tick "Add Python to PATH") and Node.js 24, then:

```
git clone https://github.com/a1702610/PharmCanvasBeautifier.git
cd PharmCanvasBeautifier
```

Double-click `setup.bat` once, then `start.bat` each time. The app opens at http://localhost:5173.

## Deploying (maintainers)

Each side needs the other's address, so do it in this order:

1. **Backend on Render.** In the Render dashboard: **New → Blueprint**, pick this repository (it uses `render.yaml`). When asked for `ALLOWED_ORIGINS`, enter `http://localhost:5173` for now. Wait for the deploy to finish, then open `https://<your-service>.onrender.com/api/health`. It should show `{"status":"ok"}` (the first load can take up to a minute while the free server wakes up).
2. **Frontend on Vercel.** **Add New → Project**, import this repository, set **Root Directory** to `frontend` (Vercel detects Vite). Under **Environment Variables** add `VITE_API_BASE_URL` = your Render address, e.g. `https://pharm-canvas-backend.onrender.com`. Deploy. Note: this value is baked in when the site is built, so if you change it later you must redeploy.
3. **Connect them.** Back in Render → your service → **Environment**, set `ALLOWED_ORIGINS` to your Vercel address, e.g. `https://pharmcanvas.vercel.app` (add more, comma-separated, if needed). Save; Render redeploys.
4. **Check.** Open the Vercel address, add your Gemini key, and generate a page.

Notes:
- No Gemini key is needed on Render; each lecturer adds their own in the browser.
- Vercel "preview" deployments get different addresses; they will only reach the backend if you add those addresses to `ALLOWED_ORIGINS` too. Use the main production address for colleagues.
- On the free plan Render sleeps after 15 minutes idle; the app shows "Waking up the server" while it starts.

## Development

- Backend tests: `cd backend && venv/Scripts/python -m pytest`
- Frontend tests: `cd frontend && npm test`
- House style lives in `frontend/src/render/templates.ts`. The standalone copy-paste prompt (`prompts/system-prompt-v2.md`) and the spec in `docs/superpowers/specs/` describe the same components.
- AI instructions live in `backend/app/prompts/`.
