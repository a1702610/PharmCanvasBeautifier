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

- **Backend (Render):** New → Blueprint → this repo (uses `render.yaml`). Set `ALLOWED_ORIGINS` to the Vercel URL.
- **Frontend (Vercel):** import the repo with root directory `frontend`. Set `VITE_API_BASE_URL` to the Render URL.

## Development

- Backend tests: `cd backend && venv/Scripts/python -m pytest`
- Frontend tests: `cd frontend && npm test`
- House style lives in `frontend/src/render/templates.ts`. The golden reference is `prompts/system-prompt-v1.md` §3.
- AI instructions live in `backend/app/prompts/`.
