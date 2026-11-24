# Fitly API

The backend for **Fitly**, a tool that tailors a resume to each job posting without inventing anything, and finds jobs worth applying to.

You keep one master resume. Paste a job posting and Fitly reorders, trims and lightly rewords what is already there to fit the role, then exports a PDF. The model can never add a skill, number or fact that is not in your master resume, and your name, contact details, companies, titles and dates never reach it at all.

The web client lives in [fitly-client](https://github.com/DeMaestro5/fitly-client).

## What it does

- **Tailors a resume to a job.** Reads a pasted posting (any site, no per-site rules), works out what the role needs, and rewrites the headline, summary, bullet order and skills order to match.
- **Checks every model output in code.** The model's answer is validated before it is accepted, and rejected answers are retried once with the errors fed back.
- **Renders PDFs.** Five templates (classic, modern, elegant, banner, timeline), rendered from HTML by headless Chrome (Puppeteer).
- **Imports a resume from a PDF.** Upload an existing resume and get an editable draft, with a list of fields that need checking.
- **Finds jobs.** Pulls remote jobs from several free sources into one list, removes duplicates, scores each job against your master resume, and tracks your status and notes per job.
- **Drafts application emails** for jobs that apply by email, using only facts from your resume.
- **Has real accounts.** Every user has their own master resume, job statuses, notes and scores.

## How the tailoring stays honest

The master resume is split in two:

| Part | Contains | Reaches the model? |
| --- | --- | --- |
| Locked | name, email, phone, location, links, education, company names, titles, dates, project names | Never |
| Tailorable | headline, summary, bullets, project descriptions, skills order | Yes |

Guardrails run in code after the model answers:

- Every id in the output must exist in the master resume, and no extra keys are accepted (strict Zod schemas).
- Skills must come from an allow-list built from the resume.
- Numbers in bullets must already exist in the original.
- Each role keeps at least half of its bullets.
- The summary is tailored in its own small model call, and each sentence is fact-checked against the resume instead of just counting sentences. If it fails, a safer fallback is used.
- A gaps report shows which required technologies matched and which are missing.

Application emails follow the same rule: code checks the length (70 to 150 words), rejects placeholders and filler, and requires every technology and number to exist in the resume. The greeting and signature are added by code, not the model.

## Architecture

```mermaid
flowchart LR
  Client[fitly-client<br/>React] -->|/api| Routes
  subgraph API[Express API]
    Routes --> Auth[auth middleware<br/>JWT]
    Auth --> Controllers --> Services
    Services --> Repo[repositories]
  end
  Services --> Groq[Groq LLM]
  Services --> Chrome[Puppeteer<br/>PDF rendering]
  Repo --> PG[(PostgreSQL)]
  Sched[Scheduler<br/>every 3 hours] --> Sources[Job sources]
  Sources --> Repo
```

Layers, from the outside in:

- **routes** map URLs to controllers and attach validation and rate limits.
- **controllers** read the request and write the response.
- **services** hold the business logic: tailoring, scoring, rendering, auth, email drafts.
- **repo** is the only layer that talks to the database.
- **schemas** are Zod definitions shared by validation and types.
- **sources** are one adapter per job board, all returning the same job shape.

## Authentication

Plain registration and login (no email verification), built to be hard to get wrong:

- Passwords are hashed with **bcrypt** (cost 12). Login takes the same time whether or not the email exists.
- A short-lived **access token** (JWT, HS256, 15 minutes) with issuer and audience checks. Only HS256 is accepted.
- A random **refresh token**, stored only as a SHA-256 hash. It is rotated on every use, and reusing an old one revokes the whole session.
- The refresh token lives in an **httpOnly, SameSite=Strict cookie** scoped to `/api/auth`, so page JavaScript can never read it. Logout revokes it on the server.
- Every route under `/api` requires a valid token except `/api/auth/*`.
- Rate limits on login, register and refresh, plus per-user limits on the endpoints that cost model calls.
- Helmet, locked-down CORS, and Zod validation on all input.
- An optional invite code can gate registration.

## Job sources

Himalayas, Remote OK, We Work Remotely, Remotive, Jobicy, Arbeitnow, Hacker News (the monthly "Who is hiring" thread plus the YC jobs feed), Greenhouse, Lever and Ashby company boards (from a watch-list file), and Mercor.

A scheduler refreshes them every 3 hours, and a manual refresh is available. Jobs are shared by everyone, but status, notes and match score are stored per user. Duplicates across sources are grouped, and jobs not seen for 21 days are marked expired.

Scoring is code only (no model call): role fit from the title plus overlap between the job's skills and your master resume, with penalties for a different stack and caps for non-engineering roles.

## Tech stack

Node.js, Express 5, TypeScript, Zod 4, PostgreSQL (`pg`), Groq (`groq-sdk`), Puppeteer, `bcrypt`, `jsonwebtoken`, Helmet, `express-rate-limit`, `pdf-parse`, `fast-xml-parser`, `html-to-text`. Unit tests use Node's built-in test runner.

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/register`, `login`, `refresh`, `logout`, `GET /api/auth/me` |
| Master resume | `GET` and `PUT /api/master-resume`, `POST /api/master-resume/import` (PDF), `/preview`, `/pdf` |
| Tailoring | `POST /api/tailor` (JSON or plain text body) |
| Rendering | `GET /api/templates`, `POST /api/render`, `POST /api/render/preview` |
| Jobs | `GET /api/jobs`, `GET /api/jobs/:id`, `PATCH /api/jobs/:id`, `GET /api/jobs/sources`, `POST /api/jobs/refresh`, `POST /api/jobs/:id/email` |
| Health | `GET /health` |

## Run it locally

You need Node.js, Docker (for PostgreSQL) and a free [Groq API key](https://console.groq.com).

```bash
git clone https://github.com/DeMaestro5/fitly-api.git
cd fitly-api
npm install

# PostgreSQL on port 5433
docker compose up -d

# create .env (see below), then:
npm run dev
```

The API starts on `http://localhost:4000`. Database tables are created automatically on startup. Then start [fitly-client](https://github.com/DeMaestro5/fitly-client), which proxies `/api` to this server.

### Environment variables

```dotenv
NODE_ENV=development
PORT=4000

GROQ_API_KEY=your-groq-key
GROQ_MODEL=openai/gpt-oss-120b
HIMALAYAS_API_KEY=your-himalayas-key

DATABASE_URL=postgres://fitly:fitly@localhost:5433/fitly
JWT_ACCESS_SECRET=at-least-32-random-characters
CLIENT_ORIGIN=http://localhost:5173

# Optional
# INVITE_CODE=8-or-more-characters
# ACCESS_TOKEN_TTL_MIN=15
# REFRESH_TOKEN_TTL_DAYS=7
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |

## Project structure

```
src/
  config/        validated environment variables
  controllers/   request and response handling
  routes/        URLs, validation, rate limits
  services/      tailoring, scoring, rendering, auth, email, scheduler
  repo/          database access (PostgreSQL)
  schemas/       Zod schemas (resume, jobs, API, auth)
  sources/       one adapter per job board
  middleware/    auth, validation, rate limiting, errors
  utils/         shared helpers
```

## Notes

- Tailoring runs on Groq's free tier, which allows roughly one full request per minute. The app waits and retries when it is rate limited.
- Fitly is a personal tool built for my own job search. It is not hosted, and I am happy to run it for you live.
