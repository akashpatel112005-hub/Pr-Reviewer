# AI Pull Request Reviewer

An automated code review SaaS platform that uses LLMs to analyse GitHub pull requests, surface security vulnerabilities and code quality issues, post inline review comments directly on PRs, and display a per-user analytics dashboard.

---

## Problem

Code reviews are time-consuming. Junior developers often miss subtle bugs, security flaws, or style violations. This tool acts as an always-on AI reviewer that analyses every PR the moment it is opened or updated — before a human ever reads it.

---

## Who Uses It

- Individual developers who want automated feedback on their own repositories
- Small teams that want a first-pass review before human review
- Anyone who installs the GitHub App and wants actionable, inline AI comments on their pull requests

---

## Features

- **GitHub OAuth login** — one-click sign in via GitHub App OAuth
- **Automatic webhook ingestion** — reviews triggered automatically when a PR is opened or synchronized
- **LLM-powered code analysis** — diff is sent to an LLM; findings are extracted and classified
- **Inline review comments** — findings are posted as GitHub review comments at the correct file + line
- **Risk scoring** — each PR is scored LOW / MEDIUM / HIGH based on severity of findings
- **Summary generation** — a plain-English summary is generated and posted as the review body
- **Background job queue** — reviews are queued and processed by an in-process worker; failed jobs can be retried
- **Multi-user, multi-repo** — each user sees only their own repositories and reviews
- **Repository management** — users can connect repos via paste-link lookup, enable/pause repos, and trigger reviews of all open PRs
- **Admin dashboard** — overview of PRs reviewed, findings, risk distribution, and recent jobs
- **102 automated tests** across 11 test suites

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v7 |
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | GitHub OAuth 2.0, JWT (HS256) |
| GitHub integration | Octokit REST + GitHub Apps API |
| LLM | Groq API (OpenAI-compatible) |
| Job queue | In-process async queue (custom) |
| Deployment | Render (backend), Vercel (frontend) |
| Tests | Jest + Supertest (102 tests, 11 suites) |

---

## Architecture

```
User (browser)
  │
  ├── GitHub OAuth → Backend /api/auth → JWT
  │
  ▼
Frontend (Vercel)
  │  React SPA — Landing, Repositories, Overview, Jobs, PR Detail
  │
  ▼
Backend (Render / localhost:5000)
  │
  ├── /api/auth         GitHub OAuth login + token exchange
  ├── /api/repos        Repository CRUD + installation sync
  ├── /api/pull-requests  Per-user PR analytics
  ├── /api/jobs         Job queue management + rerun
  ├── /webhook          GitHub App webhook receiver
  └── /health           Uptime check
  │
  ├── Worker (in-process)
  │     Poll queue → run pipeline → publish review
  │
  ├── Pipeline
  │     Fetch diff → filter files → LLM review → risk score → summary → post review
  │
  ├── MongoDB Atlas
  │     User, Installation, Repo, Job, PullRequest, Review, Finding, AuthCode
  │
  └── GitHub App API (Octokit)
        Installation tokens → post inline comments
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- MongoDB Atlas account (free tier works)
- GitHub App (see below)
- Groq API key (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/pr-reviewer.git
cd pr-reviewer
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Configure environment variables

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:

```env
PORT=5000
MONGODB_URI=mongodb+srv://...
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=<random 64-char hex>

GITHUB_APP_ID=<your app id>
GITHUB_APP_SLUG=<your app slug>
GITHUB_APP_PRIVATE_KEY=<base64-encoded PEM>
GITHUB_CLIENT_ID=<OAuth client id>
GITHUB_CLIENT_SECRET=<OAuth client secret>
GITHUB_WEBHOOK_SECRET=<webhook secret>

LLM_PROVIDER=groq
LLM_API_KEY=<groq api key>
LLM_MODEL=openai/gpt-oss-120b
```

**Frontend** — copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

### 4. Create a GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set **Callback URL** to `http://localhost:5000/api/auth/github/callback`
3. Set **Webhook URL** to your server URL + `/webhook` (use a tunnel like ngrok for local dev)
4. Permissions needed:
   - Repository: `Pull requests` (Read & Write), `Contents` (Read)
   - Webhook events: `Pull request`, `Installation`, `Installation repositories`
5. Generate a private key, base64-encode it, and set as `GITHUB_APP_PRIVATE_KEY`

### 5. Start the servers

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173 and sign in with GitHub.

---

## Running Tests

```bash
cd backend && npm test
```

102 tests across 11 suites — all passing.

---

## Deployment

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com), connect this repo
2. Set **Root Directory** to `backend`
3. Set **Build Command** to `npm install`
4. Set **Start Command** to `node src/server.js`
5. Add all environment variables from `backend/.env.example`
6. Update `BACKEND_URL` to your Render URL
7. Update your GitHub App's **Webhook URL** and **Callback URL** to the Render URL

### Frontend → Vercel

1. Import the repo on [Vercel](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Set `VITE_API_URL` to your Render backend URL
4. Deploy — `vercel.json` already has the SPA rewrite rule

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing user JWTs |
| `GITHUB_APP_ID` | Numeric GitHub App ID |
| `GITHUB_APP_SLUG` | App slug (from app URL) |
| `GITHUB_APP_PRIVATE_KEY` | Base64-encoded RSA private key PEM |
| `GITHUB_CLIENT_ID` | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret |
| `LLM_PROVIDER` | `groq` or `anthropic` or `openai` |
| `LLM_API_KEY` | LLM provider API key |
| `LLM_MODEL` | Model name (e.g. `openai/gpt-oss-120b`) |
| `BACKEND_URL` | Public URL of the backend (for OAuth redirect) |
| `FRONTEND_URL` | Public URL of the frontend (for CORS) |

---

## Key Engineering Decisions

- **GitHub App over Personal Access Tokens** — enables multi-user support; each installation gets its own scoped token
- **One-time exchange codes** — frontend never receives the JWT directly from OAuth; it exchanges a short-lived code (60s TTL, SHA-256 hashed in DB) for a JWT, preventing token leakage in URLs
- **In-process job queue** — keeps deployment simple (single Render service) while still providing retry semantics and job status tracking
- **Structured LLM output** — JSON schema enforced on LLM response; `reviewSchema.js` validates structure before saving findings
- **Tenant scoping** — all API routes resolve user from JWT and scope every DB query to `userId`, preventing cross-user data access
- **Webhook idempotency** — `X-GitHub-Delivery` ID stored on each job; duplicate delivery attempts are rejected before queueing

---

## License

MIT
