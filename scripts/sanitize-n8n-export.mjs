#!/usr/bin/env node
// Strip instance- and account-specific data from an n8n workflow export so it
// can be committed. Usage:
//
//   docker exec <n8n-container> n8n export:workflow --id <id> --pretty --output=- > raw.json
//   node scripts/sanitize-n8n-export.mjs raw.json n8n/customer-support-workflow.json
//
// Removes: owner/project sharing info (name + e-mail), static trigger state,
// version bookkeeping, pinned test data. Replaces: Supabase project URLs,
// Google Docs/Drive IDs and any non-example e-mail address with placeholders.
// Credential references (id + display name) are kept: they contain no secret
// and n8n needs them to re-link credentials on import.

import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/sanitize-n8n-export.mjs <export.json> <output.json>')
  process.exit(1)
}

const KEEP = ['name', 'nodes', 'connections', 'settings', 'tags']
const counts = {}
const bump = (what) => (counts[what] = (counts[what] ?? 0) + 1)

const RULES = [
  [/https:\/\/[a-z0-9]{20}\.supabase\.co/g, 'https://YOUR-PROJECT-REF.supabase.co', 'supabase url'],
  [/https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+[^"\s]*/g, 'https://docs.google.com/document/d/YOUR-GOOGLE-DOC-ID/edit', 'google doc'],
  [/https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+/g, 'https://drive.google.com/drive/folders/YOUR-DRIVE-FOLDER-ID', 'drive folder'],
  [/[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, 'support@example.com', 'email'],
]

function scrubString(value) {
  let out = value
  for (const [pattern, replacement, label] of RULES) {
    out = out.replace(pattern, () => (bump(label), replacement))
  }
  return out
}

function walk(node, key) {
  if (typeof node === 'string') return scrubString(node)
  if (Array.isArray(node)) return node.map((item) => walk(item))
  if (node && typeof node === 'object') {
    // Google Drive "folder to watch" stores the bare folder ID in `value`.
    if (key === 'folderToWatch' && typeof node.value === 'string') {
      bump('drive folder')
      node = { ...node, value: 'YOUR-DRIVE-FOLDER-ID' }
    }
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]))
  }
  return node
}

const raw = JSON.parse(readFileSync(input, 'utf8'))
const workflows = (Array.isArray(raw) ? raw : [raw]).map((wf) => {
  const kept = Object.fromEntries(KEEP.filter((k) => k in wf).map((k) => [k, wf[k]]))
  return { ...walk(kept), pinData: {}, staticData: null }
})

writeFileSync(output, JSON.stringify(Array.isArray(raw) ? workflows : workflows[0], null, 2) + '\n')
console.log(`wrote ${output}`, counts)
