# n8n workflow

`customer-support-workflow.json` is an export of the production workflow
(86 nodes). One workflow covers both paths:

- **Draft path** — Gmail Trigger → classify → embed → gather knowledge-base
  passages, similar past corrections, thread history and learned rules → LLM
  agent drafts the reply → row in `email_logs` (or sent straight away when the
  store has auto-send on).
- **Send path** — starts at the `Send Approved Reply (Webhook)` node, called by
  the `approve-reply` Edge Function: secret check → send with Gmail → mark the
  row `sent` → if the edit was significant, summarise it into a lesson and log
  it to `reply_corrections`.

## Importing

1. In n8n: **Workflows → Import from file** and pick
   `customer-support-workflow.json`.
2. Create and select credentials for: Gmail (OAuth2), Google Docs / Drive
   (OAuth2, only for the optional knowledge-base ingestion branch), OpenRouter,
   OpenAI and Supabase (project URL + service-role key). The export keeps only
   credential *names*; n8n never exports their secrets.
3. Replace the placeholders:
   - `https://YOUR-PROJECT-REF.supabase.co` in the `Get Similar Corrections`
     HTTP node,
   - `YOUR-GOOGLE-DOC-ID` and `YOUR-DRIVE-FOLDER-ID` in the Google nodes.
4. Set `N8N_WEBHOOK_SECRET` in n8n's environment (the `Webhook Secret Check`
   node reads `{{ $env.N8N_WEBHOOK_SECRET }}`) to the same value as the Edge
   Function secret of the same name.
5. Point the Supabase function secret `N8N_WEBHOOK_URL` at the production URL
   of the `send-approved-reply` webhook.

## Updating the export

Export from the running instance, then strip account-specific data before
committing:

```bash
docker exec <n8n-container> n8n export:workflow --id <workflow-id> --pretty --output=- > raw.json
node scripts/sanitize-n8n-export.mjs raw.json n8n/customer-support-workflow.json
rm raw.json
```

The sanitiser removes owner / sharing details, trigger state and version
metadata, and replaces Supabase URLs, Google IDs and e-mail addresses with
placeholders.
