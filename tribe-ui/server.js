/**
 * Tribe Control UI — Local Express Server
 * Serves the UI and provides REST API for all TCA configuration.
 *
 * Start: NODE_PATH=./node_modules node server.js
 * Opens: http://localhost:5173
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const app = express();
const PORT = process.env.TRIBE_UI_PORT || 5173;

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'openclaw.json');
const ENV_PATH = path.join(ROOT, '.env');
const WS_DIR = path.join(ROOT, 'workspace');
const LOGS_DIR = path.join(ROOT, 'logs');
const CMDS_PATH = path.join(__dirname, 'CommandsList.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJSON(p, fb = {}) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
}

function writeJSON(p, data) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

/** Deep merge b into a */
function deepMerge(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') {
            out[k] = deepMerge(a[k], v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function parseEnv(p) {
    const r = {};
    if (!fs.existsSync(p)) return r;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const idx = t.indexOf('=');
        if (idx < 0) continue;
        r[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    }
    return r;
}

function writeEnvMerge(updates) {
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split('\n') : [];
    const written = new Set();
    const out = existing.map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const idx = t.indexOf('=');
        if (idx < 0) return line;
        const k = t.slice(0, idx).trim();
        if (k in updates) { written.add(k); return `${k}=${updates[k]}`; }
        return line;
    });
    for (const [k, v] of Object.entries(updates)) {
        if (!written.has(k)) out.push(`${k}=${v}`);
    }
    fs.writeFileSync(ENV_PATH, out.join('\n'), 'utf8');
}

function redact(k, v) {
    return (k.includes('KEY') || k.includes('TOKEN') || k.includes('SECRET') || k.includes('PASS'))
        ? (v ? `${'*'.repeat(Math.min(v.length - 4, 24))}${v.slice(-4)}` : '') : v;
}

// ─── Status ───────────────────────────────────────────────────────────────────
app.get('/api/status', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ─── Universal config PATCH ───────────────────────────────────────────────────
/**
 * PATCH /api/openclaw
 * Body: partial openclaw.json object — deep merged into the existing config
 * This is the core plug-n-play endpoint. EVERY form in the UI posts here.
 */
app.get('/api/openclaw', (_, res) => res.json(readJSON(CONFIG_PATH)));

app.patch('/api/openclaw', (req, res) => {
    try {
        const current = readJSON(CONFIG_PATH, {});
        const updated = deepMerge(current, req.body);
        writeJSON(CONFIG_PATH, updated);
        res.json({ ok: true, config: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/openclaw', (req, res) => {
    try {
        writeJSON(CONFIG_PATH, req.body);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Environment ─────────────────────────────────────────────────────────────
app.get('/api/env', (_, res) => {
    const env = parseEnv(ENV_PATH);
    const safe = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, redact(k, v)]));
    res.json(safe);
});

app.patch('/api/env', (req, res) => {
    try { writeEnvMerge(req.body); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Channels (convenience wrappers) ─────────────────────────────────────────
// WhatsApp: PATCH /api/channels/whatsapp
// Body: { enabled, allowFrom, dmPolicy }  — saves to openclaw.json + .env
app.patch('/api/channels/whatsapp', (req, res) => {
    try {
        const { enabled, allowFrom, dmPolicy, whatsappNumber } = req.body;
        const cfg = readJSON(CONFIG_PATH, {});
        const wa = cfg.channels?.whatsapp || {};
        if (enabled !== undefined) wa.enabled = enabled;
        if (allowFrom !== undefined) wa.allowFrom = Array.isArray(allowFrom) ? allowFrom : [allowFrom];
        if (whatsappNumber) wa.allowFrom = [whatsappNumber];
        if (dmPolicy) wa.dmPolicy = dmPolicy;
        cfg.channels = deepMerge(cfg.channels || {}, { whatsapp: wa });
        writeJSON(CONFIG_PATH, cfg);
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Telegram: PATCH /api/channels/telegram
// Body: { enabled, botToken }
app.patch('/api/channels/telegram', (req, res) => {
    try {
        const { enabled, botToken } = req.body;
        const cfg = readJSON(CONFIG_PATH, {});
        const tg = cfg.channels?.telegram || {};
        if (enabled !== undefined) tg.enabled = enabled;
        if (botToken) {
            tg.botToken = botToken;
            writeEnvMerge({ TELEGRAM_BOT_TOKEN: botToken });
        }
        cfg.channels = deepMerge(cfg.channels || {}, { telegram: tg });
        writeJSON(CONFIG_PATH, cfg);
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Model switch ─────────────────────────────────────────────────────────────
const KEY_MAP = {
    anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
    google: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY',
};

app.post('/api/model', (req, res) => {
    try {
        const { model, apiKey, provider, heartbeatModel } = req.body;
        if (!model) return res.status(400).json({ error: 'model required' });
        const cfg = readJSON(CONFIG_PATH, {});
        cfg.agent = deepMerge(cfg.agent || {}, { model });
        if (heartbeatModel) cfg.heartbeat = deepMerge(cfg.heartbeat || {}, { model: heartbeatModel });
        writeJSON(CONFIG_PATH, cfg);
        if (apiKey && provider) {
            const envKey = KEY_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;
            writeEnvMerge({ [envKey]: apiKey });
        }
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Agent identity ───────────────────────────────────────────────────────────
app.patch('/api/agent', (req, res) => {
    try {
        const cfg = readJSON(CONFIG_PATH, {});
        cfg.agent = deepMerge(cfg.agent || {}, req.body);
        writeJSON(CONFIG_PATH, cfg);
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Heartbeat ────────────────────────────────────────────────────────────────
app.patch('/api/heartbeat', (req, res) => {
    try {
        const cfg = readJSON(CONFIG_PATH, {});
        cfg.heartbeat = deepMerge(cfg.heartbeat || {}, req.body);
        writeJSON(CONFIG_PATH, cfg);
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Gateway ──────────────────────────────────────────────────────────────────
app.patch('/api/gateway', (req, res) => {
    try {
        const cfg = readJSON(CONFIG_PATH, {});
        cfg.gateway = deepMerge(cfg.gateway || {}, req.body);
        writeJSON(CONFIG_PATH, cfg);
        res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gateway status (try to hit the OpenClaw gateway)
app.get('/api/gateway/status', async (req, res) => {
    try {
        const cfg = readJSON(CONFIG_PATH, {});
        const port = cfg.gateway?.port || 18789;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
            const r = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: controller.signal });
            clearTimeout(timeout);
            res.json({ online: r.ok, port, status: r.ok ? 'running' : 'error' });
        } catch {
            clearTimeout(timeout);
            res.json({ online: false, port, status: 'offline' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Workspace files ──────────────────────────────────────────────────────────
app.get('/api/workspace', (_, res) => {
    try {
        if (!fs.existsSync(WS_DIR)) return res.json([]);
        const files = fs.readdirSync(WS_DIR).filter(f => !f.startsWith('.')).map(f => {
            const fp = path.join(WS_DIR, f);
            const stat = fs.statSync(fp);
            return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
        });
        res.json(files);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workspace/:file', (req, res) => {
    try {
        const fp = path.join(WS_DIR, path.basename(req.params.file));
        if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
        res.json({ name: path.basename(fp), content: fs.readFileSync(fp, 'utf8') });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/workspace/:file', (req, res) => {
    try {
        const fp = path.join(WS_DIR, path.basename(req.params.file));
        fs.writeFileSync(fp, req.body.content || '', 'utf8');
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Commands ─────────────────────────────────────────────────────────────────
app.get('/api/commands', (_, res) => res.json(readJSON(CMDS_PATH, [])));
app.post('/api/commands', (req, res) => {
    try { writeJSON(CMDS_PATH, req.body); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Logs ─────────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 60;
    const logPath = path.join(LOGS_DIR, 'heartbeat.md');
    if (!fs.existsSync(logPath)) return res.json([{
        time: new Date().toISOString(), level: 'info',
        msg: 'No logs yet — logs appear here after the agent runs.'
    }]);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-limit);
    res.json(lines.map(l => {
        const m = l.match(/^(\S+)\s+\[(\w+)\]\s+(.+)$/);
        return m ? { time: m[1], level: m[2].toLowerCase(), msg: m[3] } : { time: '', level: 'info', msg: l };
    }));
});

// ─── Antfarm ──────────────────────────────────────────────────────────────────
function antfarmCLI() {
    // Try common install locations
    const candidates = [
        path.join(process.env.HOME, '.openclaw', 'workspace', 'antfarm', 'dist', 'cli', 'cli.js'),
        'antfarm',
    ];
    for (const c of candidates) {
        try { execSync(`${c.endsWith('.js') ? 'node ' : ''}${c} --version`, { stdio: 'ignore' }); return c; }
        catch { }
    }
    return null;
}

app.get('/api/antfarm/status', (_, res) => {
    const cli = antfarmCLI();
    if (!cli) return res.json({ installed: false });
    try {
        const out = execSync(`${cli.endsWith('.js') ? 'node ' : ''}${cli} workflow runs`, { encoding: 'utf8', timeout: 8000 });
        res.json({ installed: true, output: out });
    } catch (e) { res.json({ installed: true, error: e.message }); }
});

app.post('/api/antfarm/install', (_, res) => {
    res.json({ ok: true, cmd: 'curl -fsSL https://raw.githubusercontent.com/snarktank/antfarm/v0.5.1/scripts/install.sh | bash' });
});

app.post('/api/antfarm/run', (req, res) => {
    const { workflow, task } = req.body;
    if (!workflow || !task) return res.status(400).json({ error: 'workflow and task required' });
    const cli = antfarmCLI();
    if (!cli) return res.status(400).json({ error: 'Antfarm not installed' });
    try {
        const bin = cli.endsWith('.js') ? `node ${cli}` : cli;
        const out = execSync(`${bin} workflow run ${workflow} "${task.replace(/"/g, '\\"')}"`, { encoding: 'utf8', timeout: 10000 });
        res.json({ ok: true, output: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/antfarm/runs', (_, res) => {
    const cli = antfarmCLI();
    if (!cli) return res.json({ installed: false, runs: [] });
    try {
        const bin = cli.endsWith('.js') ? `node ${cli}` : cli;
        const out = execSync(`${bin} workflow runs`, { encoding: 'utf8', timeout: 5000 });
        res.json({ installed: true, output: out });
    } catch (e) { res.json({ installed: true, error: e.message, runs: [] }); }
});

// ─── Chat (direct agent communication) ───────────────────────────────────────
// In-memory chat history (survives server restarts via log file)
const CHAT_LOG_PATH = path.join(LOGS_DIR, 'tribechat.json');

function readChatLog() {
    try {
        if (fs.existsSync(CHAT_LOG_PATH)) return JSON.parse(fs.readFileSync(CHAT_LOG_PATH, 'utf8'));
    } catch { }
    return [];
}

function appendChatLog(msg) {
    const log = readChatLog();
    log.push(msg);
    // Keep last 200 messages
    const trimmed = log.slice(-200);
    try {
        if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
        fs.writeFileSync(CHAT_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch { }
    return trimmed;
}

app.get('/api/chat/history', (_, res) => {
    res.json(readChatLog());
});

app.post('/api/chat', async (req, res) => {
    const { message, userId = 'tribe-ui-user', sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    // Save user message to log
    const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        text: message.trim(),
        ts: new Date().toISOString(),
        userId,
    };
    appendChatLog(userMsg);

    // Try to forward to the OpenClaw gateway
    const cfg = readJSON(CONFIG_PATH, {});
    const gwPort = cfg.gateway?.port || 18789;
    const gwUrl = `http://127.0.0.1:${gwPort}`;

    let agentReply = null;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for agent
        try {
            // OpenClaw typically exposes /api/message or /webhook for direct HTTP messages
            const body = JSON.stringify({
                message: message.trim(),
                userId,
                sessionId: sessionId || 'tribe-ui',
                channel: 'http',
                source: 'tribe-ui',
            });
            const r = await fetch(`${gwUrl}/api/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (r.ok) {
                const data = await r.json();
                agentReply = data.reply || data.message || data.text || data.content || JSON.stringify(data);
            } else {
                agentReply = `[Gateway returned ${r.status}. Is the OpenClaw gateway running?]`;
            }
        } catch (fetchErr) {
            clearTimeout(timeout);
            if (fetchErr.name === 'AbortError') {
                agentReply = '[Agent timed out — no response in 30 seconds. Is the gateway running?]';
            } else {
                agentReply = `[Gateway offline — start OpenClaw gateway to chat with your agent. Error: ${fetchErr.message}]`;
            }
        }
    } catch (e) {
        agentReply = `[Error: ${e.message}]`;
    }

    const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: agentReply,
        ts: new Date().toISOString(),
    };
    appendChatLog(assistantMsg);

    res.json({ ok: true, message: userMsg, reply: assistantMsg });
});

app.delete('/api/chat/history', (_, res) => {
    try {
        if (fs.existsSync(CHAT_LOG_PATH)) fs.writeFileSync(CHAT_LOG_PATH, '[]', 'utf8');
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log(`\n  🚀 Tribe Control UI`);
    console.log(`  ➜  http://localhost:${PORT}\n`);
});
