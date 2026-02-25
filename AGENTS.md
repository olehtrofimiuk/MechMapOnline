# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview
Hex Map Online (MechMapOnline) — a real-time collaborative hex grid mapping tool. Two services: a Python/FastAPI backend and a React/Vite frontend.

### Services

| Service | Port | Start Command |
|---------|------|---------------|
| Backend (FastAPI + Socket.IO + SQLite) | 8000 | `cd server && source venv/bin/activate && python uvi.py` |
| Frontend (React + Vite dev server) | 3000 | `cd client && npm run dev` |

### Gotchas

- The backend entry point is `server/uvi.py`, **not** `server/main.py`. Running `python main.py` imports everything but does not start uvicorn.
- The frontend proxies `/api` and `/socket.io` to `localhost:8000` via Vite config (`client/vite.config.js`). Both services must be running for end-to-end functionality.
- SQLite database is auto-created at `server/room_data/mechmap.sqlite` on first startup — no external database needed.
- The `assets/` directory (unit icons) is referenced at repo root level (`/workspace/assets`). If missing, the server logs a warning but still functions.
- No lockfile exists by design (`.gitignore` ignores all lockfiles); `npm install` is the correct command for the client.
- Python venv must be created with `python3 -m venv venv` inside `server/`; `python3.12-venv` apt package may need to be installed first.
- No automated test suite exists. The `npm test` script is a placeholder that exits with error.

### Lint / Build / Dev

- **Lint**: `cd client && npx eslint src/` (ESLint 8 with `.eslintrc.cjs`)
- **Build**: `cd client && npm run build` (outputs to `client/build/`)
- **Dev**: Start both services (backend then frontend) as described above.
