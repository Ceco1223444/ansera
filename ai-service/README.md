# ai-service

A small FastAPI service that does the **learning** half of Ansera: it groups
reply corrections by the lesson they teach and writes one standing rule per
mature group. It runs the sweep once a day on its own and can be triggered
over HTTP. See [docs/architecture.md § 3](../docs/architecture.md#3-correction-learning)
for the algorithm.

| Module | Role |
|---|---|
| `main.py` | FastAPI app, auth check, daily scheduler |
| `preferences.py` | the sweep: embed notes, assign clusters, write / refresh rules (Supabase REST + OpenAI embeddings) |
| `clustering.py` | pure maths: cosine similarity, running-mean centroids, nearest cluster, the rule gate |
| `claude_client.py` | LLM calls to Claude through OpenRouter, with retries and prompt caching |
| `prompts.py` | system prompt for `/generate-reply` |
| `consolidation.py` | the earlier single-pass rule writer (kept for `/consolidate-corrections`) |
| `test_clustering.py` | unit tests for `clustering.py` (standard library only) |

## Endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness, no auth |
| POST | `/refresh-preferences` | `{"client_email": "..."}` | run the sweep for one store |
| POST | `/refresh-all-preferences` | — | run the sweep for every store |
| POST | `/generate-reply` | `{"client_email", "subject", "incoming_message", ...}` | draft a reply (cached, retried) |
| POST | `/consolidate-corrections` | `{"client_email": "..."}` | legacy rule writer |

All POST endpoints require `X-Service-Secret: <AI_SERVICE_SECRET>`. Interactive
docs are served at `/docs`.

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Used for |
|---|---|
| `OPENROUTER_API_KEY` | LLM calls (rule writing, `/generate-reply`) |
| `OPENAI_API_KEY` | embedding correction notes (`text-embedding-ada-002`, 1536 dims) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | reading corrections and writing clusters / rules |
| `AI_SERVICE_SECRET` | shared secret callers must send (`openssl rand -hex 32`) |

## Run

```bash
cd ai-service

# tests (no dependencies needed)
python test_clustering.py

# locally
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --env-file .env
curl http://localhost:8000/health

# in Docker
docker build -t ansera-ai-service .
docker run -d --name ansera-ai-service --restart unless-stopped \
  -p 8123:8000 --env-file .env ansera-ai-service
```

Trigger a sweep for one store:

```bash
curl -X POST http://localhost:8123/refresh-preferences \
  -H "X-Service-Secret: $AI_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"client_email": "demo@ansera.dev"}'
```
