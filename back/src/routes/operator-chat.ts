
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';

const execFileAsync = promisify(execFile);
const router = Router();

function gatewayAuthSecret() { return process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_TOKEN; }
function openclawBase() { return (process.env.OPENCLAW_BASE_URL || 'http://localhost:18791/v1').replace(/\/$/, ''); }
function sessionKey() { return process.env.OPENCLAW_OPERATOR_SESSION_KEY || 'agent:main:main'; }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b: any) => b?.type === 'text' && typeof b.text === 'string' ? b.text : '').filter(Boolean).join('\n');
  return '';
}
function iso(value: unknown): string | null {
  const d = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : typeof value === 'string' ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
function normalize(entries: any[]) {
  return entries.map((raw, index) => {
    const msg = raw?.message ?? raw;
    if (msg?.role !== 'user' && msg?.role !== 'assistant') return null;
    if (msg?.openclawDeliveryMirror || raw?.openclawDeliveryMirror || msg?.model === 'delivery-mirror') return null;
    const text = textOf(msg.content ?? msg.text).trim();
    if (!text) return null;
    return { id: String(msg.id ?? raw.id ?? `entry-${index}`), role: msg.role, text, createdAt: iso(msg.timestamp ?? raw.timestamp ?? msg.createdAt) };
  }).filter(Boolean);
}
async function readJsonl(raw: string, limit: number) {
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((e) => e.type === 'message').slice(-limit);
}
async function historyEntries(key: string, limit: number) {
  if (process.env.OPENCLAW_OPERATOR_TRANSCRIPT_FILE) return readJsonl(await readFile(process.env.OPENCLAW_OPERATOR_TRANSCRIPT_FILE, 'utf8'), limit);
  const container = process.env.OPENCLAW_DOCKER_CONTAINER || 'OpenClaw_Agents_3A';
  if (!/^[a-zA-Z0-9_.-]+$/.test(container)) throw new Error('invalid OPENCLAW_DOCKER_CONTAINER');
  const script = `
const fs=require('node:fs'), path=require('node:path');
const key=process.argv[1], limit=Number(process.argv[2]||50);
const storePath='/home/node/.openclaw/agents/main/sessions/sessions.json';
const store=JSON.parse(fs.readFileSync(storePath,'utf8'));
const sessions=Array.isArray(store.sessions)?store.sessions:Object.values(store.sessions||store||{});
const row=store[key]||sessions.find((s)=>s&&s.key===key)||sessions.find((s)=>s&&s.runtimePolicySessionKey===key);
if(!row||!row.sessionId){console.log('[]');process.exit(0)}
const jsonl=path.join(path.dirname(storePath),row.sessionId+'.jsonl');
const entries=fs.readFileSync(jsonl,'utf8').split(/\\r?\\n/).filter(Boolean).map((l)=>JSON.parse(l)).filter((e)=>e.type==='message').slice(-limit);
console.log(JSON.stringify(entries));`;
  const { stdout } = await execFileAsync('docker', ['exec', container, 'node', '-e', script, key, String(limit)], { timeout: 8000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout || '[]');
}

router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.json({ messages: normalize(await historyEntries(sessionKey(), limit)) });
  } catch (e) {
    console.error('[operator-chat] history failed:', e);
    res.status(502).json({ error: { code: 'openclaw_history_failed', message: 'No se pudo leer OpenClaw' } });
  }
});

router.post('/send', async (req: Request, res: Response) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const clientMessageId = typeof req.body?.clientMessageId === 'string' ? req.body.clientMessageId : `crm-${Date.now()}`;
  const auth = gatewayAuthSecret();
  if (!text) return res.status(422).json({ error: { code: 'invalid', message: 'Falta text' } });
  if (!auth) return res.status(503).json({ error: { code: 'openclaw_unconfigured', message: 'Falta OPENCLAW_GATEWAY_PASSWORD' } });
  try {
    const resp = await fetch(`${openclawBase()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}`, 'x-openclaw-session-key': sessionKey(), 'x-openclaw-agent-id': process.env.OPENCLAW_OPERATOR_AGENT_ID || 'main', 'Idempotency-Key': clientMessageId },
      body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: text }], stream: false, user: sessionKey() }),
    });
    if (!resp.ok) throw new Error(`OpenClaw ${resp.status}`);
    res.status(202).json({ accepted: true, clientMessageId });
  } catch (e) {
    console.error('[operator-chat] send failed:', e);
    res.status(502).json({ error: { code: 'openclaw_send_failed', message: 'OpenClaw rechazó el envío' } });
  }
});

export const operatorChatRouter = router;
