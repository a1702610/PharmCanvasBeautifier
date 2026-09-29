# PharmCanvas

Turns pharmacy lecture material (Word, PowerPoint, PDF, or an old Canvas page) into a Canvas page in the shared pharmacy house style, ready to paste into Canvas.

## Using the hosted app

1. Open the app link you were given.
2. Click **Insert API Key** (top right) and paste a Gemini API key. Get one free at https://aistudio.google.com/apikey. The key stays in your browser.
3. **Create:** drop in your files, or click **Paste Canvas page HTML** to bring in an old page. Reorder them with the arrows, then click **Generate page**. The first request of the day can take up to a minute while the server wakes up.
4. **Review:** click through the tabs in the preview. Read **Notes for you**: these are things to check, such as images to upload and content the AI flagged.
5. **Adjust:** click ⟳ next to a tab to regenerate just that tab with an instruction (for example "make this shorter"). Click ↶ to undo.
6. **Images:** click **Images ⤓** to download the images the page uses (`IMG-01.png`…). Upload them to Canvas and replace each dashed `[INSERT IMAGE …]` box.
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
- House style lives in `frontend/src/render/templates.ts`. The golden reference is `prompts/system-prompt-v1.md` §3.
- AI instructions live in `backend/app/prompts/`.
