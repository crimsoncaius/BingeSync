# BingeSync — local dev (PowerShell)

**Prerequisites:** Python and Node.js on `PATH`. Keep ports **8000** and **5173** free.

## One-time setup (repo root)

```powershell
cd C:\Users\Caius\Desktop\BingeSync

python -m venv backend\.venv

.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

npm install --prefix frontend
```

## Terminal 1 — Backend

```powershell
cd C:\Users\Caius\Desktop\BingeSync\backend

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Backend:** http://127.0.0.1:8000

## Terminal 2 — Frontend

```powershell
cd C:\Users\Caius\Desktop\BingeSync\frontend

npx vite --host 127.0.0.1 --port 5173
```

**Frontend:** http://127.0.0.1:5173

## Places Autocomplete playground (optional)

Separate Vite app to try **Places API (New)** autocomplete parameters. Uses **`GOOGLE_PLACES_API_KEY`** from the repo root **`.env`** (same as the backend). Dev server only — run from its folder:

```powershell
cd C:\Users\Caius\Desktop\BingeSync\places-autocomplete-playground

npm install

npm run dev
```

**Playground:** http://127.0.0.1:5180
