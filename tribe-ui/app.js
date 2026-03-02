'use strict';
const App = (() => {
  const BASE = 'http://localhost:5173';
  const state = {
    view: 'overview', cfg: {}, env: {}, cmds: [], wsFiles: [],
    wsSelected: null, wsContent: '', gatewayOnline: false,
    antfarmInstalled: false, antfarmOutput: '', logsData: [],
    searchQ: '', cmdCategory: 'All',
    chatModel: null,   // tracks the currently selected chat model
    chatFiles: [],     // attached files for next send
    providers: {
      anthropic: { label: 'Anthropic', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'] },
      openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
      google: { label: 'Google', models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
      openrouter: { label: 'OpenRouter', models: ['meta-llama/llama-3.3-70b-instruct:nitro', 'deepseek/deepseek-r1', 'openrouter/auto'] },
      groq: { label: 'Groq', models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
    },
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ag = () => state.cfg.agent ?? {};
  const hb = () => state.cfg.heartbeat ?? {};
  const wa = () => state.cfg.channels?.whatsapp ?? {};
  const tg = () => state.cfg.channels?.telegram ?? {};
  const gw = () => state.cfg.gateway ?? {};
  const def = () => state.cfg.agents?.defaults ?? {};

  function providerOf(model = '') {
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gpt')) return 'openai';
    if (model.includes('gemini')) return 'google';
    if (model.includes('llama') || model.includes('deepseek') || model.includes('openrouter')) return 'openrouter';
    return 'anthropic';
  }
  function providerOpts(sel) {
    return Object.entries(state.providers).map(([k, p]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${p.label}</option>`).join('');
  }
  function modelOpts(prov, cur) {
    const known = (state.providers[prov] || state.providers.anthropic).models;
    const isCustom = cur && !known.includes(cur.replace(/^[^/]+\//, ''));
    return known.map(m => `<option value="${m}" ${cur?.includes(m) ? 'selected' : ''}>${m}</option>`).join('') +
      `<option value="__custom" ${isCustom ? 'selected' : ''}>✏️ Type a custom model…</option>`;
  }

  function modelCustomInput(selectId, cur) {
    // Returns an input box that appears below the select when __custom is chosen
    const known = Object.values(state.providers).flatMap(p => p.models);
    const isCustom = cur && !known.includes(cur.replace(/^[^/]+\//, ''));
    return `<input class="form-input" id="${selectId}-custom"
      style="margin-top:6px;${isCustom ? '' : 'display:none'}"
      placeholder="e.g. anthropic/claude-opus-4-5 or meta-llama/llama-70b"
      value="${esc(isCustom ? (cur ?? '') : '')}"
      oninput="this.dataset.dirty='1'">`;
  }

  async function api(method, path, body) {
    try {
      const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return await r.json();
    } catch (e) { return { error: e.message }; }
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2800);
  }

  async function saveCfg(patch, label = 'Settings') {
    const r = await api('PATCH', '/api/openclaw', patch);
    if (r.ok) { state.cfg = r.config; toast(`${label} saved`); }
    else toast(`Failed: ${r.error || label}`, 'error');
    return r;
  }
  async function saveEnv(patch, label = 'Key') {
    const r = await api('PATCH', '/api/env', patch);
    if (r.ok) toast(`${label} saved`);
    else toast(`Failed: ${r.error || label}`, 'error');
    return r;
  }

  function val(id) { return document.getElementById(id)?.value ?? ''; }
  function chk(id) { return document.getElementById(id)?.checked ?? false; }

  // ── Views ────────────────────────────────────────────────────────────────────

  function viewOverview() {
    const prov = providerOf(ag().model ?? '');
    const model = ag().model?.split('/').pop() ?? '—';
    return `
    <div class="page-hd">
      <div class="page-kicker">Tribe Control Panel</div>
      <div class="page-hd-row">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">Your agent, channels, and system at a glance</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" onclick="App.loadAll().then(App.render)">↺ Refresh</button>
        </div>
      </div>
      <div class="page-rule"></div>
    </div>

    <div class="stat-grid">
      <div class="stat-card" onclick="App.showView('gateway')">
        <div class="stat-kicker">Gateway</div>
        <div class="stat-val ${state.gatewayOnline ? 'green' : 'muted'}">${state.gatewayOnline ? 'Online' : 'Offline'}</div>
        <div class="stat-sub">Port ${gw().port ?? 18789} · ${gw().bind ?? 'loopback'}</div>
      </div>
      <div class="stat-card" onclick="App.showView('agent')">
        <div class="stat-kicker">Active Model</div>
        <div class="stat-val gold" style="font-size:17px">${esc(model)}</div>
        <div class="stat-sub">${esc(prov)} · click to switch</div>
      </div>
      <div class="stat-card" onclick="App.showView('channels')">
        <div class="stat-kicker">WhatsApp</div>
        ${(() => { const configured = wa().enabled && (wa().allowFrom?.length > 0); return `<div class="stat-val ${configured ? 'green' : 'muted'}">${configured ? 'Configured' : wa().enabled ? 'Enabled — no number' : 'Not configured'}</div><div class="stat-sub">${configured ? esc(wa().allowFrom?.[0] ?? '') : 'Set up in Channels'}</div>`; })()}
      </div>
      <div class="stat-card" onclick="App.showView('channels')">
        <div class="stat-kicker">Telegram</div>
        ${(() => { const configured = tg().enabled && tg().botToken; return `<div class="stat-val ${configured ? 'green' : 'muted'}">${configured ? 'Configured' : tg().enabled ? 'Enabled — no token' : 'Not configured'}</div><div class="stat-sub">${configured ? 'Bot connected' : 'Set up in Channels'}</div>`; })()}
      </div>
    </div>

    <div class="action-grid">
      ${[
        ['Configure Channels', 'channels', 'Messaging + webhooks'],
        ['Switch Model', 'agent', 'Provider, tokens, temp'],
        ['Edit Workspace', 'workspace', 'SOUL.md, USER.md, files'],
        ['Run Antfarm', 'antfarm', 'Multi-agent workflows'],
        ['View Commands', 'commands', 'All slash commands'],
        ['System Logs', 'logs', 'Heartbeat & sessions'],
      ].map(([t, v, s]) => `<div class="action-card" onclick="App.showView('${v}')"><div class="action-card-title">${t}</div><div class="action-card-sub">${s}</div></div>`).join('')}
    </div>

    <div class="panels">
      <div class="card">
        <div class="card-hd"><div><div class="card-title">Heartbeat</div><div class="card-sub">Autonomous background schedule</div></div><span class="tag ${hb().enabled ? 'tag-green' : 'tag-muted'}">${hb().enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div class="cfg-tr"><span class="cfg-key">Interval</span><span class="cfg-val">${hb().intervalMinutes ?? 60} minutes</span></div>
        <div class="cfg-tr"><span class="cfg-key">Model</span><span class="cfg-mono">${esc(hb().model ?? '—')}</span></div>
        <div class="cfg-tr" style="border:none"><span class="cfg-key">Agent Name</span><span class="cfg-val">${esc(ag().name ?? 'Tribe')}</span></div>
        <div class="mt-14"><button class="btn btn-ghost btn-sm" onclick="App.showView('agent')">Edit →</button></div>
      </div>
      <div class="card">
        <div class="card-hd"><div><div class="card-title">Channels</div><div class="card-sub">Active messaging connections</div></div></div>
        <div class="cfg-tr"><span class="cfg-key">WhatsApp</span><span class="tag ${wa().enabled ? 'tag-green' : 'tag-muted'}">${wa().enabled ? 'On' : 'Off'}</span></div>
        <div class="cfg-tr"><span class="cfg-key">Telegram</span><span class="tag ${tg().enabled ? 'tag-green' : 'tag-muted'}">${tg().enabled ? 'On' : 'Off'}</span></div>
        <div class="cfg-tr"><span class="cfg-key">DM Policy</span><span class="cfg-val">${esc(wa().dmPolicy ?? 'pairing')}</span></div>
        <div class="cfg-tr" style="border:none"><span class="cfg-key">Workspace</span><span class="text-mono text-tiny" style="color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(def().workspace ?? '—')}</span></div>
        <div class="mt-14"><button class="btn btn-ghost btn-sm" onclick="App.showView('channels')">Edit →</button></div>
      </div>
    </div>`;
  }

  function viewChannels() {
    return `
    <div class="page-hd">
      <div class="page-kicker">Communication</div>
      <div class="page-title">Channels</div>
      <div class="page-sub">Messaging platforms, webhooks, and allowlists — all saved directly to openclaw.json</div>
      <div class="page-rule"></div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">WhatsApp</div><label class="toggle"><input type="checkbox" id="wa-enabled" ${wa().enabled ? 'checked' : ''} onchange="App.saveWA()"><span class="toggle-track"></span></label></div>
      <div class="card">
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Allowed Number (owner)</label><input class="form-input" id="wa-number" value="${esc((wa().allowFrom ?? [''])[0])}" placeholder="+15555550123"></div>
          <div class="field mb-0"><label class="form-label">DM Policy</label>
            <select class="form-select" id="wa-dmpolicy">
              <option value="pairing" ${wa().dmPolicy === 'pairing' ? 'selected' : ''}>Pairing (QR scan)</option>
              <option value="open"    ${wa().dmPolicy === 'open' ? 'selected' : ''}>Open (any number)</option>
              <option value="allowlist" ${wa().dmPolicy === 'allowlist' ? 'selected' : ''}>Allowlist only</option>
            </select></div>
          <div class="field mb-0"><label class="form-label">Session Timeout (mins)</label><input class="form-input" id="wa-timeout" type="number" value="${esc(wa().sessionTimeoutMinutes ?? 60)}"></div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Response Delay (ms)</label><input class="form-input" id="wa-delay" type="number" value="${esc(wa().responseDelayMs ?? 500)}"></div>
          <div class="field mb-0"><label class="form-label">Message Format</label>
            <select class="form-select" id="wa-format">
              <option value="markdown" ${wa().format === 'markdown' ? 'selected' : ''}>Markdown</option>
              <option value="plain"    ${wa().format === 'plain' ? 'selected' : ''}>Plain text</option>
            </select></div>
          <div class="field mb-0"><label class="form-label">Max Message Length</label><input class="form-input" id="wa-maxlen" type="number" value="${esc(wa().maxMessageLength ?? 4096)}"></div>
        </div>
        <div class="field"><label class="form-label">Extended Allowlist (one number per line)</label>
          <textarea class="form-textarea" id="wa-allowlist" style="min-height:70px">${esc((wa().allowFrom ?? []).join('\n'))}</textarea>
          <div class="form-hint">Numbers that can message the agent. Leave blank to allow all (not recommended).</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ink" onclick="App.saveWA()">Save WhatsApp</button>
          <button class="btn btn-ghost" onclick="App.pairWA()">Pair via QR</button>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Telegram</div><label class="toggle"><input type="checkbox" id="tg-enabled" ${tg().enabled ? 'checked' : ''} onchange="App.saveTG()"><span class="toggle-track"></span></label></div>
      <div class="card">
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Bot Token</label><input class="form-input" id="tg-token" type="password" placeholder="123456:AABBcc…" value="${esc(tg().botToken ?? '')}"></div>
          <div class="field mb-0"><label class="form-label">Webhook Mode</label>
            <select class="form-select" id="tg-webhook">
              <option value="polling" ${tg().webhookMode === 'polling' ? 'selected' : ''}>Long polling</option>
              <option value="webhook" ${tg().webhookMode === 'webhook' ? 'selected' : ''}>Webhook</option>
            </select></div>
          <div class="field mb-0"><label class="form-label">Session Timeout (mins)</label><input class="form-input" id="tg-timeout" type="number" value="${esc(tg().sessionTimeoutMinutes ?? 60)}"></div>
        </div>
        <div class="field"><label class="form-label">Allowed User IDs (one per line, leave blank for all)</label>
          <textarea class="form-textarea" id="tg-userids" style="min-height:70px">${esc((tg().allowedUserIds ?? []).join('\n'))}</textarea></div>
        <button class="btn btn-ink" onclick="App.saveTG()">Save Telegram</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Webhook</div></div>
      <div class="card">
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:2"><label class="form-label">Webhook URL</label><input class="form-input" id="wh-url" value="${esc(gw().webhookUrl ?? '')}" placeholder="https://your-server.com/hook"></div>
          <div class="field mb-0"><label class="form-label">Secret Token</label><input class="form-input" id="wh-secret" type="password" value="${esc(gw().webhookSecret ?? '')}" placeholder="••••••••"></div>
        </div>
        <div class="field"><label class="form-label">Events to forward</label>
          <div class="check-grid mt-8">
            ${['message', 'heartbeat', 'session_start', 'session_end', 'tool_call', 'error'].map(e => `
            <label class="checkbox"><input type="checkbox" class="wh-event" value="${e}" ${(gw().webhookEvents ?? []).includes(e) ? 'checked' : ''}><span class="checkbox-label">${e}</span></label>`).join('')}
          </div></div>
        <button class="btn btn-ink" onclick="App.saveWebhook()">Save Webhook</button>
      </div>
    </div>`;
  }

  function viewAgent() {
    const prov = providerOf(ag().model ?? '');
    const hbProv = providerOf(hb().model ?? '');
    return `
    <div class="page-hd">
      <div class="page-kicker">Agent Configuration</div>
      <div class="page-title">Identity & Model</div>
      <div class="page-sub">Model selection, behavior parameters, persona, and schedule</div>
      <div class="page-rule"></div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Model Switcher</div></div>
      <div class="card">
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Provider</label><select class="form-select" id="m-prov" onchange="App.onProvChange('m-prov','m-model')">${providerOpts(prov)}</select></div>
          <div class="field mb-0"><label class="form-label">Model</label>
            <select class="form-select" id="m-model" onchange="App.onModelChange('m-model')">${modelOpts(prov, ag().model)}</select>
            ${modelCustomInput('m-model', ag().model)}
          </div>
          <div class="field mb-0"><label class="form-label">API Key (optional)</label><input class="form-input" id="m-apikey" type="password" placeholder="Saved to .env, leave blank to keep"></div>
        </div>
        <div class="divider-h"></div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Temperature <span id="temp-val" style="font-family:var(--font-mono);color:var(--txt)">${def().temperature ?? 1.0}</span></label>
            <input type="range" id="m-temp" min="0" max="2" step="0.05" value="${def().temperature ?? 1.0}" oninput="document.getElementById('temp-val').textContent=this.value">
          </div>
          <div class="field mb-0"><label class="form-label">Max Tokens</label><input class="form-input" id="m-maxtok" type="number" value="${def().maxTokens ?? 8192}" min="256" max="200000"></div>
          <div class="field mb-0"><label class="form-label">Context Window</label><input class="form-input" id="m-context" type="number" value="${def().contextWindow ?? 200000}" min="1024"></div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Thinking Depth</label>
            <select class="form-select" id="m-think">
              ${['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map(l => `<option value="${l}" ${def().thinkingDepth === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="field mb-0"><label class="form-label">Response Format</label>
            <select class="form-select" id="m-format">
              <option value="markdown" ${def().format === 'markdown' ? 'selected' : ''}>Markdown</option>
              <option value="plain" ${def().format === 'plain' ? 'selected' : ''}>Plain text</option>
            </select></div>
          <div class="field mb-0"><label class="form-label">Verbose Mode</label>
            <select class="form-select" id="m-verbose">
              <option value="off" ${!def().verbose ? 'selected' : ''}>Off</option>
              <option value="on"  ${def().verbose ? 'selected' : ''}>On</option>
            </select></div>
        </div>
        <button class="btn btn-ink" onclick="App.saveModel()">Apply Model & Behavior</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Agent Identity & Persona</div></div>
      <div class="card">
        <div class="irow mb-14">
          <div class="field mb-0"><label class="form-label">Agent Name</label><input class="form-input" id="a-name" value="${esc(ag().name ?? 'Tribe')}"></div>
          <div class="field mb-0" style="flex:2"><label class="form-label">Workspace Path</label><input class="form-input" id="a-workspace" value="${esc(def().workspace ?? '')}"></div>
        </div>
        <div class="field"><label class="form-label">System Prompt / SOUL override (leave blank to use SOUL.md)</label>
          <textarea class="form-textarea" id="a-system" style="min-height:100px" placeholder="You are Tribe, an autonomous AI agent…">${esc(ag().systemPrompt ?? '')}</textarea>
          <div class="form-hint">Saved to openclaw.json. Overrides SOUL.md when set. Clear to revert to SOUL.md.</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ink" onclick="App.saveIdentity()">Save Identity</button>
          <button class="btn btn-ghost" onclick="App.showView('workspace')">Edit SOUL.md →</button>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Heartbeat Schedule</div></div>
      <div class="card">
        <div class="irow-4 mb-14">
          <div class="field mb-0"><label class="form-label">Enabled</label><br><label class="toggle" style="margin-top:6px"><input type="checkbox" id="hb-on" ${hb().enabled ? 'checked' : ''}><span class="toggle-track"></span></label></div>
          <div class="field mb-0"><label class="form-label">Interval (mins)</label><input class="form-input" id="hb-interval" type="number" value="${hb().intervalMinutes ?? 60}" min="5" max="1440"></div>
          <div class="field mb-0"><label class="form-label">Provider</label><select class="form-select" id="hb-prov" onchange="App.onProvChange('hb-prov','hb-model')">${providerOpts(hbProv)}</select></div>
          <div class="field mb-0"><label class="form-label">Model</label><select class="form-select" id="hb-model">${modelOpts(hbProv, hb().model)}</select></div>
        </div>
        <div class="field"><label class="form-label">Heartbeat Prompt (what the agent does on each heartbeat)</label>
          <textarea class="form-textarea" id="hb-prompt" style="min-height:80px" placeholder="Check for pending tasks, review recent messages, surface anything urgent…">${esc(hb().prompt ?? '')}</textarea></div>
        <button class="btn btn-ink" onclick="App.saveHeartbeat()">Save Heartbeat</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Model Fallback Chain</div><span class="sec-note">If primary is rate-limited, try these in order</span></div>
      <div class="card">
        <div class="irow-3 mb-14">
          ${[1, 2, 3].map(i => `<div class="field mb-0"><label class="form-label">Fallback ${i}</label><input class="form-input" id="fb-${i}" value="${esc((def().fallbackModels ?? [])[i - 1] ?? '')}" placeholder="e.g. openai/gpt-4o-mini"></div>`).join('')}
        </div>
        <div class="form-hint">Full model strings e.g. <code>anthropic/claude-haiku-4-5</code>. Leave blank to skip that slot.</div>
        <div class="mt-12"><button class="btn btn-ink" onclick="App.saveFallbacks()">Save Fallbacks</button></div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Tool Permissions</div><span class="sec-note">Which tools the agent may use</span></div>
      <div class="card">
        <div class="check-grid">
          ${['computer', 'bash', 'editor', 'browser', 'calendar', 'email', 'github', 'slack', 'notion', 'weather', 'search', 'memory'].map(t => `
          <label class="checkbox"><input type="checkbox" class="tool-perm" value="${t}" ${(def().allowedTools ?? ALL_TOOLS).includes(t) ? 'checked' : ''}><span class="checkbox-label">${t}</span></label>`).join('')}
        </div>
        <div class="form-hint mt-8">Unchecked tools will be refused even if the agent calls them. Changes take effect on next session.</div>
        <div class="mt-12"><button class="btn btn-ink" onclick="App.saveToolPerms()">Save Permissions</button></div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">API Keys</div><span class="sec-note">Saved directly to .env</span></div>
      <div class="card">
        <div class="panels">
          ${[['ANTHROPIC_API_KEY', 'Anthropic'], ['OPENAI_API_KEY', 'OpenAI'], ['GEMINI_API_KEY', 'Google Gemini'], ['OPENROUTER_API_KEY', 'OpenRouter'], ['GROQ_API_KEY', 'Groq'], ['TELEGRAM_BOT_TOKEN', 'Telegram Bot']].map(([k, l]) => `
          <div class="irow"><div class="field mb-0" style="flex:1"><label class="form-label">${l}</label><input class="form-input" type="password" id="key-${k}" placeholder="••••••••••"></div><button class="btn btn-ghost btn-sm" style="margin-top:16px" onclick="App.saveKey('${k}','${l}')">Save</button></div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  const ALL_TOOLS = ['computer', 'bash', 'editor', 'browser', 'calendar', 'email', 'github', 'slack', 'notion', 'weather', 'search', 'memory'];

  function viewCommands() {
    const cats = ['All', ...new Set(state.cmds.map(c => c.category))];
    const filtered = state.cmds.filter(c => {
      const matchQ = !state.searchQ || c.syntax?.toLowerCase().includes(state.searchQ.toLowerCase()) || c.description?.toLowerCase().includes(state.searchQ.toLowerCase());
      const matchCat = state.cmdCategory === 'All' || c.category === state.cmdCategory;
      return matchQ && matchCat;
    });
    return `
    <div class="page-hd">
      <div class="page-kicker">Agent Commands</div>
      <div class="page-title">Commands</div>
      <div class="page-sub">${state.cmds.length} slash commands — send these to the agent via any channel</div>
      <div class="page-rule"></div>
    </div>
    <div class="search-bar"><svg class="search-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input class="search-input" id="cmd-search" placeholder="Search commands…" value="${esc(state.searchQ)}" oninput="App.onSearch(this.value)"></div>
    <div class="cmd-filters">${cats.map(c => `<button class="cmd-filter-btn ${state.cmdCategory === c ? 'active' : ''}" onclick="App.setCategory('${c}')">${c}</button>`).join('')}</div>
    <div class="cmd-grid">${filtered.map((c, i) => `
    <div class="cmd-card" onclick="App.openCmd(${state.cmds.indexOf(c)})">
      <div class="cmd-top"><span class="cmd-syntax">${esc(c.syntax)}</span><div class="cmd-badges">${c.ownerOnly ? '<span class="tag tag-gold">Owner</span>' : ''}<span class="tag tag-muted">${esc(c.category)}</span></div></div>
      <div class="cmd-desc">${esc(c.description?.slice(0, 120))}${c.description?.length > 120 ? '…' : ''}</div>
      ${c.exampleOutput ? `<div class="cmd-ex"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.exampleOutput.slice(0, 60))}</span><button class="copy-btn" onclick="event.stopPropagation();App.copy(this,'${esc(c.syntax)}')">Copy</button></div>` : ''}
    </div>`).join('') || '<div class="empty-state">No commands match.</div>'}</div>`;
  }

  function viewWorkspace() {
    const files = state.wsFiles.map(f => `
    <div class="ws-file ${state.wsSelected === f.name ? 'ws-selected' : ''}" onclick="App.openFile('${esc(f.name)}')">
      <div><div class="ws-file-name">${esc(f.name)}</div><div class="ws-file-meta">${(f.size / 1024).toFixed(1)} KB · ${new Date(f.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt4)" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`).join('');

    return `
    <div class="page-hd">
      <div class="page-kicker">Workspace</div>
      <div class="page-title">Files</div>
      <div class="page-sub">Agent memory, persona, and config files — click to edit</div>
      <div class="page-rule"></div>
    </div>
    <div class="panels">
      <div class="card" style="margin:0">${files || '<div class="empty-state">No workspace files.</div>'}</div>
      <div>${state.wsSelected ? `
        <div class="card" style="margin:0">
          <div class="card-hd"><div><div class="card-title">${esc(state.wsSelected)}</div></div><div style="display:flex;gap:6px"><button class="btn btn-ink btn-sm" onclick="App.saveFile()">Save</button><button class="btn btn-ghost btn-sm" onclick="App.closeFile()">✕</button></div></div>
          <textarea class="form-textarea" id="ws-editor" style="min-height:480px;font-size:12px;font-family:var(--font-mono);line-height:1.75" spellcheck="false">${esc(state.wsContent)}</textarea>
        </div>`: '<div class="empty-state" style="margin-top:40px">Select a file to edit</div>'}</div>
    </div>`;
  }

  function viewAntfarm() {
    const wfs = [
      { id: 'feature-dev', n: 'Feature Development', icon: 'I', agents: 7, desc: 'Describe a feature. Receive a tested, reviewed pull request.', pipeline: ['plan', 'setup', 'implement', 'verify', 'test', 'pr', 'review'] },
      { id: 'security-audit', n: 'Security Audit', icon: 'II', agents: 7, desc: 'Point at a repository. Get a security-fix PR with regression tests.', pipeline: ['scan', 'prioritize', 'setup', 'fix', 'verify', 'test', 'pr'] },
      { id: 'bug-fix', n: 'Bug Fix', icon: 'III', agents: 6, desc: 'Paste a bug report. Get a fix with a targeted regression test.', pipeline: ['triage', 'investigate', 'setup', 'fix', 'verify', 'pr'] },
      { id: 'code-review', n: 'Code Review', icon: 'IV', agents: 5, desc: 'Paste a diff or PR URL. Receive a structured review with suggestions.', pipeline: ['fetch', 'analyze', 'security', 'feedback', 'report'] },
      { id: 'refactor', n: 'Refactor & Clean-Up', icon: 'V', agents: 6, desc: 'Name a module or smell. Get a refactored PR with tests preserved.', pipeline: ['analyze', 'plan', 'setup', 'refactor', 'test', 'pr'] },
      { id: 'docs', n: 'Documentation', icon: 'VI', agents: 5, desc: 'Point at a codebase. Get comprehensive docs written and committed.', pipeline: ['scan', 'outline', 'author', 'review', 'pr'] },
      { id: 'test-gen', n: 'Test Generation', icon: 'VII', agents: 5, desc: 'Specify coverage goals. Receive a full test suite PR.', pipeline: ['analyze', 'plan', 'generate', 'verify', 'pr'] },
      { id: 'dependency-upgrade', n: 'Dependency Upgrade', icon: 'VIII', agents: 6, desc: 'Specify a dep or "all". Get a safe upgrade PR with compatibility tests.', pipeline: ['audit', 'plan', 'upgrade', 'test', 'fix', 'pr'] },
    ];
    const installBanner = !state.antfarmInstalled ? `
    <div class="banner banner-warn">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div><strong>Antfarm CLI not detected.</strong> Install with one command:<br>
      <code style="display:block;margin:8px 0;padding:8px 12px;background:var(--bg4);font-size:11px">curl -fsSL https://raw.githubusercontent.com/snarktank/antfarm/v0.5.1/scripts/install.sh | bash</code>
      <button class="btn btn-ghost btn-sm" onclick="App.copy(null,'curl -fsSL https://raw.githubusercontent.com/snarktank/antfarm/v0.5.1/scripts/install.sh | bash')">Copy Command</button>
      <button class="btn btn-ghost btn-sm" onclick="App.checkAntfarm()" style="margin-left:6px">Check Status</button></div>
    </div>` : '';
    return `
    <div class="page-hd">
      <div class="page-kicker">Multi-Agent Workflows</div>
      <div class="page-title"><em>Antfarm</em> — Autonomous Pipeline</div>
      <div class="page-sub">Deterministic agent teams. One task in, a full PR out.</div>
      <div class="page-rule"></div>
    </div>
    ${installBanner}
    ${wfs.map(w => `
    <div class="af-card">
      <div class="af-card-hd">
        <div class="af-num" style="font-style:italic;font-family:var(--font-serif)">${w.icon}</div>
        <div style="flex:1"><div class="af-name">${esc(w.n)}</div><div class="af-desc">${esc(w.desc)}</div></div>
        <span class="af-agents-badge">${w.agents} agents</span>
      </div>
      <div class="af-pipeline">${w.pipeline.map((s, i) => `<span class="af-step">${s}</span>${i < w.pipeline.length - 1 ? '<span class="af-arrow">→</span>' : ''}`).join('')}</div>
      <div class="af-run-row"><input class="form-input" id="af-${w.id}" placeholder="Describe the task — e.g. &quot;Add OAuth login with Google&quot;"><button class="btn btn-ink" onclick="App.runWorkflow('${w.id}')">Run</button></div>
    </div>`).join('')}
    ${state.antfarmOutput ? `<div class="card mt-16"><div class="card-title mb-8">Last Output</div><pre>${esc(state.antfarmOutput)}</pre></div>` : ''}`;
  }

  function viewGateway() {
    return `
    <div class="page-hd">
      <div class="page-kicker">System</div>
      <div class="page-title">Gateway & Security</div>
      <div class="page-sub">Network, authentication, CORS, and session management</div>
      <div class="page-rule"></div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Network</div><span class="tag ${state.gatewayOnline ? 'tag-green' : 'tag-muted'}">${state.gatewayOnline ? 'Online' : 'Offline'}</span></div>
      <div class="card">
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Port</label><input class="form-input" id="gw-port" type="number" value="${gw().port ?? 18789}"></div>
          <div class="field mb-0"><label class="form-label">Bind Address</label>
            <select class="form-select" id="gw-bind">
              <option value="loopback" ${gw().bind === 'loopback' ? 'selected' : ''}>127.0.0.1 (loopback only)</option>
              <option value="all"      ${gw().bind === 'all' ? 'selected' : ''}>0.0.0.0 (all interfaces)</option>
            </select></div>
          <div class="field mb-0"><label class="form-label">Max Connections</label><input class="form-input" id="gw-maxconn" type="number" value="${gw().maxConnections ?? 100}"></div>
        </div>
        <button class="btn btn-ink" onclick="App.saveGateway()">Save Network</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Authentication & CORS</div></div>
      <div class="card">
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:2"><label class="form-label">Auth Token (Bearer)</label><input class="form-input" id="gw-authtoken" type="password" value="${esc(gw().authToken ?? '')}" placeholder="Leave blank to disable auth"></div>
          <div class="field mb-0" style="flex:1"><label class="form-label">Token TTL (hours)</label><input class="form-input" id="gw-tokttl" type="number" value="${gw().tokenTTLHours ?? 24}"></div>
        </div>
        <div class="field"><label class="form-label">CORS Allowed Origins (one per line)</label>
          <textarea class="form-textarea" id="gw-cors" style="min-height:70px" placeholder="https://your-app.com">${esc((gw().allowedOrigins ?? []).join('\n'))}</textarea>
          <div class="form-hint">Leave blank to allow all origins (not recommended for production).</div></div>
        <button class="btn btn-ink" onclick="App.saveGatewayAuth()">Save Auth & CORS</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Rate Limiting</div></div>
      <div class="card">
        <div class="irow-3 mb-14">
          <div class="field mb-0"><label class="form-label">Requests / minute</label><input class="form-input" id="rl-rpm" type="number" value="${gw().rateLimit?.requestsPerMinute ?? 60}"></div>
          <div class="field mb-0"><label class="form-label">Messages / hour</label><input class="form-input" id="rl-mph" type="number" value="${gw().rateLimit?.messagesPerHour ?? 200}"></div>
          <div class="field mb-0"><label class="form-label">Burst allowance</label><input class="form-input" id="rl-burst" type="number" value="${gw().rateLimit?.burst ?? 10}"></div>
        </div>
        <button class="btn btn-ink" onclick="App.saveRateLimit()">Save Rate Limits</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hd"><div class="sec-title">Quick Reference</div></div>
      <div class="card">
        ${[
        ['Start gateway', 'openclaw gateway --port 18789'],
        ['Pair WhatsApp', 'openclaw channels login'],
        ['Check status', 'openclaw gateway status'],
        ['List sessions', 'openclaw sessions list'],
        ['Kill session', 'openclaw sessions kill <id>'],
        ['View current config', 'openclaw show config'],
        ['Reload without restart', 'openclaw reload'],
      ].map(([d, cmd]) => `
        <div class="cfg-tr">
          <span class="cfg-key">${esc(d)}</span>
          <code style="font-size:11.5px">${esc(cmd)}</code>
          <button class="copy-btn" onclick="App.copy(this,'${esc(cmd)}')">Copy</button>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function viewLogs() {
    const entries = state.logsData.map(l => `
    <div class="log-entry">
      <span class="log-time">${l.time ? new Date(l.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span>
      <span class="log-level ${l.level}">${esc(l.level)}</span>
      <span class="log-msg">${esc(l.msg)}</span>
    </div>`).join('') || '<div class="empty-state">No logs yet — start the gateway to see activity.</div>';
    return `
    <div class="page-hd">
      <div class="page-kicker">System</div>
      <div class="page-hd-row"><div class="page-title">Logs</div><button class="btn btn-ghost btn-sm" onclick="App.loadLogs()">↺ Refresh</button></div>
      <div class="page-sub">Heartbeat cycles, session events, and errors</div>
      <div class="page-rule"></div>
    </div>
    <div class="card"><div class="log-list">${entries}</div></div>`;
  }

  // ── Settings view (comprehensive plain-English config) ──────────────────────
  function viewSettings() {
    const cr = () => state.cfg.cron ?? {};
    const ses = () => state.cfg.session ?? {};
    const cmp = () => state.cfg.agents?.defaults?.compaction ?? {};
    const prn = () => state.cfg.agents?.defaults?.contextPruning ?? {};
    const tls = () => state.cfg.tools ?? {};
    const msg = () => state.cfg.messages ?? {};
    const hks = () => state.cfg.hooks ?? {};
    const tts = () => state.cfg.messages?.tts ?? {};
    const sbx = () => state.cfg.agents?.defaults?.sandbox ?? {};
    const log = () => state.cfg.logging ?? {};
    const sub = () => state.cfg.agents?.defaults?.subagents ?? {};

    const currentToken = esc(gw().authToken ?? '');

    return `
    <div class="page-hd">
      <div class="page-kicker">Configuration</div>
      <div class="page-title">Settings <em>&amp; Automation</em></div>
      <div class="page-sub">All OpenClaw options in one place. Changes save directly to openclaw.json.</div>
      <div class="page-rule"></div>
    </div>
    <div class="settings-grid">

    <!-- ─── CREDENTIALS & ACCESS ──────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🔑 Credentials &amp; Access</div></div>
      <div class="creds-card">
        <div class="settings-section-note">Your gateway token authenticates the Control UI and API calls. Keep it secret. API keys are stored in your .env file.</div>

        <div class="form-label" style="margin-bottom:8px">Gateway Auth Token</div>
        <div class="token-display">
          <span id="token-masked">${currentToken ? currentToken.slice(0, 8) + '••••••••••••••••' + currentToken.slice(-4) : 'No token set — all requests are unauthenticated'}</span>
          ${currentToken ? `<button class="copy-btn" onclick="App.copy(this,'${currentToken}')">Copy</button>` : ''}
        </div>
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:2"><label class="form-label">New Token (leave blank to keep current)</label><input class="form-input" id="gw-token-new" type="password" placeholder="Paste new token or leave blank"></div>
          <div class="field mb-0"><label class="form-label">Token TTL (hours)</label><input class="form-input" id="gw-token-ttl" type="number" value="${gw().tokenTTLHours ?? 24}" min="1"></div>
        </div>
        <button class="btn btn-ink" onclick="App.saveGatewayToken()">Save Token</button>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">API Keys</div>
        <div class="settings-section-note">Saved to your .env file. Leave blank to keep the existing key.</div>
        ${[
        ['ANTHROPIC_API_KEY', 'Anthropic'],
        ['OPENAI_API_KEY', 'OpenAI'],
        ['GEMINI_API_KEY', 'Google Gemini'],
        ['OPENROUTER_API_KEY', 'OpenRouter'],
        ['GROQ_API_KEY', 'Groq'],
        ['TELEGRAM_BOT_TOKEN', 'Telegram Bot'],
        ['TWILIO_ACCOUNT_SID', 'Twilio SID'],
        ['TWILIO_AUTH_TOKEN', 'Twilio Auth Token'],
      ].map(([k, l]) => `
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:1"><label class="form-label">${l}</label><input class="form-input" type="password" id="key-${k}" placeholder="••••••••••"></div>
          <button class="btn btn-ghost btn-sm" style="margin-top:16px;flex-shrink:0" onclick="App.saveKey('${k}','${l}')">Save</button>
        </div>`).join('')}
      </div>
    </div>

    <!-- ─── CRON JOBS ──────────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd">
        <div class="sec-title">⏱ Cron Jobs &amp; Scheduled Tasks</div>
        <label class="toggle"><input type="checkbox" id="cron-on" ${cr().enabled ? 'checked' : ''}><span class="toggle-track"></span></label>
      </div>
      <div class="card">
        <div class="settings-section-note">Run tasks on a schedule — daily briefings, hourly email checks, midnight backups. Create jobs by chatting with the agent.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Max concurrent jobs</label>
            <input class="form-input" id="cron-maxconc" type="number" value="${cr().maxConcurrentRuns ?? 2}" min="1" max="10">
            <div class="form-hint">Overlapping job limit. Start with 2.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">History retention</label>
            <select class="form-select" id="cron-retention">
              <option value="1h"  ${cr().sessionRetention === '1h' ? 'selected' : ''}>1 hour</option>
              <option value="6h"  ${cr().sessionRetention === '6h' ? 'selected' : ''}>6 hours</option>
              <option value="24h" ${!cr().sessionRetention || cr().sessionRetention === '24h' ? 'selected' : ''}>24 hours</option>
              <option value="48h" ${cr().sessionRetention === '48h' ? 'selected' : ''}>48 hours</option>
              <option value="7d"  ${cr().sessionRetention === '7d' ? 'selected' : ''}>7 days</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Max log per job</label>
            <select class="form-select" id="cron-logbytes">
              <option value="500kb" ${cr().runLog?.maxBytes === '500kb' ? 'selected' : ''}>500 KB</option>
              <option value="1mb"   ${cr().runLog?.maxBytes === '1mb' ? 'selected' : ''}>1 MB</option>
              <option value="2mb"   ${!cr().runLog?.maxBytes || cr().runLog?.maxBytes === '2mb' ? 'selected' : ''}>2 MB</option>
              <option value="5mb"   ${cr().runLog?.maxBytes === '5mb' ? 'selected' : ''}>5 MB</option>
            </select>
          </div>
        </div>
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:2">
            <label class="form-label">Webhook URL (for job results)</label>
            <input class="form-input" id="cron-webhook" value="${esc(cr().webhook ?? '')}" placeholder="https://your-server.com/results">
          </div>
          <div class="field mb-0">
            <label class="form-label">Webhook token</label>
            <input class="form-input" id="cron-webhooktoken" type="password" value="${esc(cr().webhookToken ?? '')}" placeholder="optional secret">
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveCron()">Save Cron Settings</button>
      </div>
    </div>

    <!-- ─── SESSIONS ───────────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">💬 Session &amp; Conversation Memory</div></div>
      <div class="card">
        <div class="settings-section-note">Control how the agent stores conversation context across channels and users.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Memory scope</label>
            <select class="form-select" id="ses-scope">
              <option value="main"                    ${ses().dmScope === 'main' ? 'selected' : ''}>Everyone shares one</option>
              <option value="per-peer"                ${ses().dmScope === 'per-peer' ? 'selected' : ''}>Per person (all channels)</option>
              <option value="per-channel-peer"        ${!ses().dmScope || ses().dmScope === 'per-channel-peer' ? 'selected' : ''}>Per person per channel ✓</option>
              <option value="per-account-channel-peer" ${ses().dmScope === 'per-account-channel-peer' ? 'selected' : ''}>Fully isolated</option>
            </select>
            <div class="form-hint">Recommended: per person per channel.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Auto-reset</label>
            <select class="form-select" id="ses-reset">
              <option value="never" ${!ses().reset?.mode ? 'selected' : ''}>Never (manual only)</option>
              <option value="daily" ${ses().reset?.mode === 'daily' ? 'selected' : ''}>Daily at set hour</option>
              <option value="idle"  ${ses().reset?.mode === 'idle' ? 'selected' : ''}>After inactivity</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Reset at hour (0–23)</label>
            <input class="form-input" id="ses-hour" type="number" value="${ses().reset?.atHour ?? 4}" min="0" max="23">
            <div class="form-hint">Used in daily mode. e.g. 4 = 4 AM.</div>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Idle timeout (mins)</label>
            <input class="form-input" id="ses-idle" type="number" value="${ses().reset?.idleMinutes ?? 120}" min="5">
          </div>
          <div class="field mb-0">
            <label class="form-label">Max history entries</label>
            <input class="form-input" id="ses-maxentries" type="number" value="${ses().maintenance?.maxEntries ?? 500}" min="50">
            <div class="form-hint">Oldest pruned when exceeded.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Keep old transcripts</label>
            <select class="form-select" id="ses-archive">
              <option value="7d"  ${ses().maintenance?.resetArchiveRetention === '7d' ? 'selected' : ''}>7 days</option>
              <option value="30d" ${!ses().maintenance?.resetArchiveRetention || ses().maintenance?.resetArchiveRetention === '30d' ? 'selected' : ''}>30 days</option>
              <option value="90d" ${ses().maintenance?.resetArchiveRetention === '90d' ? 'selected' : ''}>90 days</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveSession()">Save Session Settings</button>
      </div>
    </div>

    <!-- ─── CONTEXT COMPACTION ────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🗜 Context Compaction</div></div>
      <div class="card">
        <div class="settings-section-note">When conversations get long, the agent summarizes history to stay within token limits.</div>
        <div class="irow mb-14">
          <div class="field mb-0">
            <label class="form-label">Compaction mode</label>
            <select class="form-select" id="cmp-mode">
              <option value="default"   ${!cmp().mode || cmp().mode === 'default' ? 'selected' : ''}>Standard (one pass)</option>
              <option value="safeguard" ${cmp().mode === 'safeguard' ? 'selected' : ''}>Safeguard (chunked)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Identifier preservation</label>
            <select class="form-select" id="cmp-ids">
              <option value="strict" ${!cmp().identifierPolicy || cmp().identifierPolicy === 'strict' ? 'selected' : ''}>Strict (keep IDs &amp; ports)</option>
              <option value="off"    ${cmp().identifierPolicy === 'off' ? 'selected' : ''}>Off</option>
              <option value="custom" ${cmp().identifierPolicy === 'custom' ? 'selected' : ''}>Custom instructions</option>
            </select>
            <div class="form-hint">Strict = keeps deployment IDs, URLs, ticket numbers.</div>
          </div>
        </div>
        <div class="field mb-14">
          <label class="form-label">Custom identifier instructions (custom mode only)</label>
          <input class="form-input" id="cmp-custom-ids" value="${esc(cmp().identifierInstructions ?? '')}" placeholder="Keep deployment IDs, ticket numbers, and host:port exactly.">
        </div>
        <div class="irow mb-14">
          <div class="field mb-0">
            <label class="form-label">Flush memory before compaction</label>
            <select class="form-select" id="cmp-flush">
              <option value="true"  ${cmp().memoryFlush?.enabled !== false ? 'selected' : ''}>Yes — write notes first</option>
              <option value="false" ${cmp().memoryFlush?.enabled === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Token safety buffer</label>
            <input class="form-input" id="cmp-reserve" type="number" value="${cmp().reserveTokensFloor ?? 24000}">
            <div class="form-hint">Tokens held back before compaction triggers.</div>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveCompaction()">Save Compaction</button>
      </div>
    </div>

    <!-- ─── CONTEXT PRUNING ───────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">✂️ Context Pruning</div></div>
      <div class="card">
        <div class="settings-section-note">Silently removes bloated tool outputs from working memory without deleting history. Keeps the agent fast.</div>
        <div class="irow mb-14">
          <div class="field mb-0">
            <label class="form-label">Pruning mode</label>
            <select class="form-select" id="prn-mode">
              <option value="off"       ${!prn().mode || prn().mode === 'off' ? 'selected' : ''}>Off (keep everything)</option>
              <option value="cache-ttl" ${prn().mode === 'cache-ttl' ? 'selected' : ''}>Cache TTL (periodic)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Prune interval</label>
            <select class="form-select" id="prn-ttl">
              <option value="30m" ${prn().ttl === '30m' ? 'selected' : ''}>Every 30 min</option>
              <option value="1h"  ${!prn().ttl || prn().ttl === '1h' ? 'selected' : ''}>Every 1 hour</option>
              <option value="2h"  ${prn().ttl === '2h' ? 'selected' : ''}>Every 2 hours</option>
              <option value="4h"  ${prn().ttl === '4h' ? 'selected' : ''}>Every 4 hours</option>
            </select>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Keep last N assistant replies</label>
            <input class="form-input" id="prn-keep" type="number" value="${prn().keepLastAssistants ?? 3}" min="1">
          </div>
          <div class="field mb-0">
            <label class="form-label">Min tool output size (chars)</label>
            <input class="form-input" id="prn-minchars" type="number" value="${prn().minPrunableToolChars ?? 50000}">
          </div>
          <div class="field mb-0">
            <label class="form-label">Pruned output placeholder</label>
            <input class="form-input" id="prn-placeholder" value="${esc(prn().hardClear?.placeholder ?? '[Old tool result cleared]')}">
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveContextPruning()">Save Pruning</button>
      </div>
    </div>

    <!-- ─── TOOL PERMISSIONS ─────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🔧 Tool Permissions</div></div>
      <div class="card">
        <div class="settings-section-note">Uncheck tools to block them entirely — even if the agent tries to call them. Changes take effect next session.</div>
        <div class="irow mb-14" style="align-items:flex-start">
          <div style="flex:1">
            <div class="form-label" style="margin-bottom:10px">File &amp; Code</div>
            <div class="check-grid">
              ${[['read', 'Read files'], ['write', 'Create/write files'], ['edit', 'Edit files'], ['apply_patch', 'Apply patches'], ['exec', 'Run shell commands'], ['process', 'Background processes']]
        .map(([t, d]) => `<label class="checkbox" title="${esc(d)}"><input type="checkbox" class="tool-perm" value="${t}" ${(tls().deny ?? []).includes(t) ? '' : 'checked'}><span class="checkbox-label">${t}</span></label>`).join('')}
            </div>
          </div>
          <div style="flex:1">
            <div class="form-label" style="margin-bottom:10px">Web &amp; AI</div>
            <div class="check-grid">
              ${[['web_search', 'Search the web'], ['web_fetch', 'Fetch a URL'], ['browser', 'Browser control'], ['canvas', 'Visual output'], ['image', 'Generate images'], ['memory_search', 'Search memory'], ['memory_get', 'Read memory']]
        .map(([t, d]) => `<label class="checkbox" title="${esc(d)}"><input type="checkbox" class="tool-perm" value="${t}" ${(tls().deny ?? []).includes(t) ? '' : 'checked'}><span class="checkbox-label">${t}</span></label>`).join('')}
            </div>
          </div>
          <div style="flex:1">
            <div class="form-label" style="margin-bottom:10px">Sessions &amp; System</div>
            <div class="check-grid">
              ${[['sessions_list', 'List sessions'], ['sessions_send', 'Send to sessions'], ['sessions_spawn', 'Spawn sub-agents'], ['sessions_history', 'Read history'], ['cron', 'Cron jobs'], ['gateway', 'Manage gateway'], ['nodes', 'Manage nodes']]
        .map(([t, d]) => `<label class="checkbox" title="${esc(d)}"><input type="checkbox" class="tool-perm" value="${t}" ${(tls().deny ?? []).includes(t) ? '' : 'checked'}><span class="checkbox-label">${t}</span></label>`).join('')}
            </div>
          </div>
        </div>
        <div class="form-hint mb-14">💡 Code agents: enable File + Web. Bots: disable exec + browser. Public agents: disable exec, write, browser, canvas.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ink" onclick="App.saveTools()">Save Permissions</button>
          <button class="btn btn-ghost" onclick="App.setAllTools(true)">Enable All</button>
          <button class="btn btn-ghost" onclick="App.setAllTools(false)">Disable All</button>
        </div>
      </div>
    </div>

    <!-- ─── TOOL LOOP DETECTION ──────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🔄 Loop Detection &amp; Safety</div></div>
      <div class="card">
        <div class="settings-section-note">Stops the agent from getting stuck in repetitive tool loops. Recommended for unattended autonomous runs.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Loop detection</label>
            <select class="form-select" id="loop-enabled">
              <option value="false" ${!tls().loopDetection?.enabled ? 'selected' : ''}>Off</option>
              <option value="true"  ${tls().loopDetection?.enabled ? 'selected' : ''}>On</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Warning threshold</label>
            <input class="form-input" id="loop-warn" type="number" value="${tls().loopDetection?.warningThreshold ?? 10}" min="3">
          </div>
          <div class="field mb-0">
            <label class="form-label">Hard stop threshold</label>
            <input class="form-input" id="loop-stop" type="number" value="${tls().loopDetection?.globalCircuitBreakerThreshold ?? 30}" min="5">
            <div class="form-hint">Agent forcibly stopped after this many no-progress calls.</div>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveLoopDetection()">Save Loop Detection</button>
      </div>
    </div>

    <!-- ─── SUB-AGENTS ───────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🤖 Sub-Agents &amp; Parallel Tasks</div></div>
      <div class="card">
        <div class="settings-section-note">Mini-agents spawned by the main agent to work in parallel — useful for research, code review, or concurrent tasks.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Max concurrent sub-agents</label>
            <input class="form-input" id="sub-max" type="number" value="${sub().maxConcurrent ?? 1}" min="1" max="10">
          </div>
          <div class="field mb-0">
            <label class="form-label">Sub-agent model (blank = main)</label>
            <input class="form-input" id="sub-model" value="${esc(sub().model ?? '')}" placeholder="anthropic/claude-haiku-4-5">
            <div class="form-hint">Use a cheaper model for sub-tasks.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Timeout (minutes)</label>
            <input class="form-input" id="sub-timeout" type="number" value="${Math.round((sub().runTimeoutSeconds ?? 900) / 60)}" min="1">
          </div>
        </div>
        <div class="field mb-14">
          <label class="form-label">Archive finished sub-agents after (mins)</label>
          <input class="form-input" id="sub-archive" type="number" value="${sub().archiveAfterMinutes ?? 60}" min="5">
        </div>
        <button class="btn btn-ink" onclick="App.saveSubagents()">Save Sub-Agent Settings</button>
      </div>
    </div>

    <!-- ─── MESSAGING BEHAVIOR ───────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">📨 Message &amp; Reply Behavior</div></div>
      <div class="card">
        <div class="settings-section-note">Fine-tune how the agent handles incoming messages, sends reactions, and manages rapid bursts.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Response prefix</label>
            <input class="form-input" id="msg-prefix" value="${esc(msg().responsePrefix ?? '')}" placeholder="e.g. 🦞 or leave blank">
            <div class="form-hint">Prepended to every reply.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Thinking reaction</label>
            <input class="form-input" id="msg-ack" value="${esc(msg().ackReaction ?? '👀')}" placeholder="👀">
            <div class="form-hint">Emoji shown while agent thinks.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Show reaction on</label>
            <select class="form-select" id="msg-ackscope">
              <option value="group-mentions" ${!msg().ackReactionScope || msg().ackReactionScope === 'group-mentions' ? 'selected' : ''}>Group mentions</option>
              <option value="group-all"      ${msg().ackReactionScope === 'group-all' ? 'selected' : ''}>All group messages</option>
              <option value="direct"         ${msg().ackReactionScope === 'direct' ? 'selected' : ''}>DMs only</option>
              <option value="all"            ${msg().ackReactionScope === 'all' ? 'selected' : ''}>Always</option>
            </select>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Inbound debounce (ms)</label>
            <input class="form-input" id="msg-debounce" type="number" value="${msg().inbound?.debounceMs ?? 2000}" min="0">
            <div class="form-hint">Wait before processing rapid texts. 0 = instant.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Queue mode</label>
            <select class="form-select" id="msg-queue">
              <option value="collect"   ${!msg().queue?.mode || msg().queue?.mode === 'collect' ? 'selected' : ''}>Collect (wait for burst)</option>
              <option value="steer"     ${msg().queue?.mode === 'steer' ? 'selected' : ''}>Steer (latest wins)</option>
              <option value="followup"  ${msg().queue?.mode === 'followup' ? 'selected' : ''}>Follow-up (queue after)</option>
              <option value="interrupt" ${msg().queue?.mode === 'interrupt' ? 'selected' : ''}>Interrupt (stop &amp; restart)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Remove reaction after reply</label>
            <select class="form-select" id="msg-removeack">
              <option value="false" ${!msg().removeAckAfterReply ? 'selected' : ''}>No — leave reaction</option>
              <option value="true"  ${msg().removeAckAfterReply ? 'selected' : ''}>Yes — remove when done</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveMessaging()">Save Message Settings</button>
      </div>
    </div>

    <!-- ─── HOOKS (INBOUND WEBHOOKS) ──────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd">
        <div class="sec-title">🪝 Inbound Webhooks</div>
        <label class="toggle"><input type="checkbox" id="hooks-on" ${hks().enabled ? 'checked' : ''}><span class="toggle-track"></span></label>
      </div>
      <div class="card">
        <div class="settings-section-note">Let external services (Gmail, GitHub, Stripe) trigger the agent automatically. The agent wakes when a webhook arrives.</div>
        <div class="irow mb-14">
          <div class="field mb-0" style="flex:2">
            <label class="form-label">Webhook path</label>
            <input class="form-input" id="hooks-path" value="${esc(hks().path ?? '/hooks')}" placeholder="/hooks">
            <div class="form-hint">POST to: http://yourip:18789/hooks/gmail</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Auth token</label>
            <input class="form-input" id="hooks-token" type="password" value="${esc(hks().token ?? '')}" placeholder="••••••••">
            <div class="form-hint">Callers send: Authorization: Bearer &lt;token&gt;</div>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Default session key</label>
            <input class="form-input" id="hooks-sesskey" value="${esc(hks().defaultSessionKey ?? 'hook:ingress')}">
          </div>
          <div class="field mb-0">
            <label class="form-label">Let callers pick session</label>
            <select class="form-select" id="hooks-allowsess">
              <option value="false" ${!hks().allowRequestSessionKey ? 'selected' : ''}>No (safe default)</option>
              <option value="true"  ${hks().allowRequestSessionKey ? 'selected' : ''}>Yes (advanced)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Max body size</label>
            <select class="form-select" id="hooks-maxbody">
              <option value="65536"   ${hks().maxBodyBytes === 65536 ? 'selected' : ''}>64 KB</option>
              <option value="262144"  ${!hks().maxBodyBytes || hks().maxBodyBytes === 262144 ? 'selected' : ''}>256 KB</option>
              <option value="1048576" ${hks().maxBodyBytes === 1048576 ? 'selected' : ''}>1 MB</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveHooks()">Save Webhook Settings</button>
      </div>
    </div>

    <!-- ─── TTS / VOICE ─────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🔊 Text-to-Speech &amp; Voice</div></div>
      <div class="card">
        <div class="settings-section-note">Reply with synthesized voice audio on channels that support it (WhatsApp, Telegram).</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">TTS provider</label>
            <select class="form-select" id="tts-prov">
              <option value=""          ${!tts().provider ? 'selected' : ''}>Off (text only)</option>
              <option value="openai"    ${tts().provider === 'openai' ? 'selected' : ''}>OpenAI TTS</option>
              <option value="elevenlabs" ${tts().provider === 'elevenlabs' ? 'selected' : ''}>ElevenLabs</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Auto-send voice</label>
            <select class="form-select" id="tts-auto">
              <option value="off"     ${!tts().auto || tts().auto === 'off' ? 'selected' : ''}>Off</option>
              <option value="always"  ${tts().auto === 'always' ? 'selected' : ''}>Always</option>
              <option value="inbound" ${tts().auto === 'inbound' ? 'selected' : ''}>When user sends voice</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">OpenAI voice</label>
            <select class="form-select" id="tts-oai-voice">
              ${['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map(v => `<option value="${v}" ${tts().openai?.voice === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="irow mb-14">
          <div class="field mb-0">
            <label class="form-label">ElevenLabs API Key</label>
            <input class="form-input" id="tts-el-key" type="password" placeholder="Saved to .env as ELEVENLABS_API_KEY">
          </div>
          <div class="field mb-0">
            <label class="form-label">ElevenLabs Voice ID</label>
            <input class="form-input" id="tts-el-voice" value="${esc(tts().elevenlabs?.voiceId ?? '')}" placeholder="EXAVITQu4vr4xnSDxMaL">
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveTTS()">Save Voice Settings</button>
      </div>
    </div>

    <!-- ─── SANDBOX ──────────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🐳 Docker Sandbox</div></div>
      <div class="card">
        <div class="settings-section-note">Run agent code inside an isolated Docker container. Recommended for public-facing agents or untrusted code.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Sandbox mode</label>
            <select class="form-select" id="sbx-mode">
              <option value="off"      ${!sbx().mode || sbx().mode === 'off' ? 'selected' : ''}>Off (fastest)</option>
              <option value="non-main" ${sbx().mode === 'non-main' ? 'selected' : ''}>Sub-agents only</option>
              <option value="all"      ${sbx().mode === 'all' ? 'selected' : ''}>All sessions</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Container scope</label>
            <select class="form-select" id="sbx-scope">
              <option value="agent"   ${!sbx().scope || sbx().scope === 'agent' ? 'selected' : ''}>Per-agent</option>
              <option value="session" ${sbx().scope === 'session' ? 'selected' : ''}>Per-session (fresh each time)</option>
              <option value="shared"  ${sbx().scope === 'shared' ? 'selected' : ''}>Shared</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Workspace access</label>
            <select class="form-select" id="sbx-wsaccess">
              <option value="none" ${!sbx().workspaceAccess || sbx().workspaceAccess === 'none' ? 'selected' : ''}>None (isolated)</option>
              <option value="ro"   ${sbx().workspaceAccess === 'ro' ? 'selected' : ''}>Read-only</option>
              <option value="rw"   ${sbx().workspaceAccess === 'rw' ? 'selected' : ''}>Read-write</option>
            </select>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Memory limit</label>
            <select class="form-select" id="sbx-mem">
              <option value="512m" ${sbx().docker?.memory === '512m' ? 'selected' : ''}>512 MB</option>
              <option value="1g"   ${!sbx().docker?.memory || sbx().docker?.memory === '1g' ? 'selected' : ''}>1 GB</option>
              <option value="2g"   ${sbx().docker?.memory === '2g' ? 'selected' : ''}>2 GB</option>
              <option value="4g"   ${sbx().docker?.memory === '4g' ? 'selected' : ''}>4 GB</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">CPU cores</label>
            <input class="form-input" id="sbx-cpu" type="number" value="${sbx().docker?.cpus ?? 1}" min="1" max="16">
          </div>
          <div class="field mb-0">
            <label class="form-label">Network access</label>
            <select class="form-select" id="sbx-net">
              <option value="none"   ${!sbx().docker?.network || sbx().docker?.network === 'none' ? 'selected' : ''}>None (safest)</option>
              <option value="bridge" ${sbx().docker?.network === 'bridge' ? 'selected' : ''}>Bridge (outbound)</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveSandbox()">Save Sandbox Settings</button>
      </div>
    </div>

    <!-- ─── LOGGING ───────────────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">📋 Logging</div></div>
      <div class="card">
        <div class="settings-section-note">Control what gets written to the log and how verbose it is.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Log level</label>
            <select class="form-select" id="log-level">
              <option value="error" ${log().level === 'error' ? 'selected' : ''}>Errors only</option>
              <option value="warn"  ${log().level === 'warn' ? 'selected' : ''}>Warnings + errors</option>
              <option value="info"  ${!log().level || log().level === 'info' ? 'selected' : ''}>Info (default)</option>
              <option value="debug" ${log().level === 'debug' ? 'selected' : ''}>Debug (verbose)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Console style</label>
            <select class="form-select" id="log-style">
              <option value="pretty"  ${!log().consoleStyle || log().consoleStyle === 'pretty' ? 'selected' : ''}>Pretty (readable)</option>
              <option value="compact" ${log().consoleStyle === 'compact' ? 'selected' : ''}>Compact</option>
              <option value="json"    ${log().consoleStyle === 'json' ? 'selected' : ''}>JSON (aggregators)</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Redact sensitive output</label>
            <select class="form-select" id="log-redact">
              <option value="off"   ${log().redactSensitive === 'off' ? 'selected' : ''}>Off — log everything</option>
              <option value="tools" ${!log().redactSensitive || log().redactSensitive === 'tools' ? 'selected' : ''}>Tools (hide sensitive)</option>
            </select>
          </div>
        </div>
        <div class="field mb-14">
          <label class="form-label">Log file path (blank = /tmp/openclaw/openclaw.log)</label>
          <input class="form-input" id="log-file" value="${esc(log().file ?? '')}" placeholder="/tmp/openclaw/openclaw.log">
        </div>
        <button class="btn btn-ink" onclick="App.saveLogging()">Save Logging</button>
      </div>
    </div>

    <!-- ─── AGENT WORKSPACE DEFAULTS ─────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">📁 Workspace Defaults</div></div>
      <div class="card">
        <div class="settings-section-note">Controls how the agent loads workspace files (SOUL.md, USER.md, AGENT.md) at startup.</div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Max chars per file</label>
            <input class="form-input" id="ws-maxchars" type="number" value="${state.cfg.agents?.defaults?.bootstrapMaxChars ?? 20000}">
            <div class="form-hint">Longer files are truncated.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Max total chars</label>
            <input class="form-input" id="ws-totalmaxchars" type="number" value="${state.cfg.agents?.defaults?.bootstrapTotalMaxChars ?? 150000}">
            <div class="form-hint">Combined limit across all files.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Your timezone</label>
            <input class="form-input" id="ws-tz" value="${esc(state.cfg.agents?.defaults?.userTimezone ?? '')}" placeholder="America/Chicago">
            <div class="form-hint">Blank = server timezone.</div>
          </div>
        </div>
        <div class="irow-3 mb-14">
          <div class="field mb-0">
            <label class="form-label">Time format</label>
            <select class="form-select" id="ws-timefmt">
              <option value="auto" ${!state.cfg.agents?.defaults?.timeFormat || state.cfg.agents?.defaults?.timeFormat === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="12"   ${state.cfg.agents?.defaults?.timeFormat === '12' ? 'selected' : ''}>12-hour (AM/PM)</option>
              <option value="24"   ${state.cfg.agents?.defaults?.timeFormat === '24' ? 'selected' : ''}>24-hour</option>
            </select>
          </div>
          <div class="field mb-0">
            <label class="form-label">Max image resolution (px)</label>
            <input class="form-input" id="ws-imgpx" type="number" value="${state.cfg.agents?.defaults?.imageMaxDimensionPx ?? 1200}" min="400" max="4000">
            <div class="form-hint">Longest side. Lower = fewer tokens.</div>
          </div>
          <div class="field mb-0">
            <label class="form-label">Auto-create workspace files</label>
            <select class="form-select" id="ws-skip">
              <option value="false" ${!state.cfg.agents?.defaults?.skipBootstrap ? 'selected' : ''}>Yes (create on first run)</option>
              <option value="true"  ${state.cfg.agents?.defaults?.skipBootstrap ? 'selected' : ''}>No (manage manually)</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ink" onclick="App.saveWorkspaceDefaults()">Save Workspace Defaults</button>
      </div>
    </div>

    <!-- ─── EXTERNAL SERVICES ────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">🔌 External Services &amp; APIs</div></div>
      <div class="card">
        <div class="settings-section-note">Add named services (Notion, CRM, weather API, etc.) the agent can call as tools. After saving, tell the agent: "Use [Name] API to…"</div>
        <div id="ext-svc-list">
          ${(state.cfg.externalServices ?? []).map((s, i) => `
          <div class="ext-svc-row" id="ext-row-${i}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px">
            <div class="field mb-0" style="flex:1;min-width:140px"><label class="form-label">Name</label><input class="form-input" id="ext-name-${i}" value="${esc(s.name ?? '')}" placeholder="My CRM"></div>
            <div class="field mb-0" style="flex:2;min-width:200px"><label class="form-label">Base URL</label><input class="form-input" id="ext-url-${i}" value="${esc(s.baseUrl ?? '')}" placeholder="https://api.example.com"></div>
            <div class="field mb-0" style="flex:1.5;min-width:160px"><label class="form-label">API Key / Token</label><input class="form-input" id="ext-key-${i}" type="password" value="${esc(s.apiKey ?? '')}" placeholder="••••••••"></div>
            <button class="btn btn-danger btn-sm" style="margin-bottom:2px" onclick="App.removeExtSvc(${i})">✕</button>
          </div>
          <div style="margin:-4px 0 14px;">
            <input class="form-input" id="ext-header-${i}" value="${esc(s.customHeader ?? '')}" placeholder="Optional: custom header e.g. X-Api-Version: 2024-01" style="font-size:11.5px">
          </div>`).join('') || '<div class="empty-state" style="margin:0 0 14px">No external services yet.</div>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="App.addExtSvc()">+ Add Service</button>
          <button class="btn btn-ink" onclick="App.saveExternalServices()">Save All Services</button>
        </div>
      </div>
    </div>

    <!-- ─── MCP INTEGRATIONS ──────────────────────────────────────────────── -->
    <div class="sec">
      <div class="sec-hd"><div class="sec-title">⚡ MCP Integrations <span class="tag tag-gold" style="margin-left:6px">Model Context Protocol</span></div></div>
      <div class="card">
        <div class="settings-section-note">MCP servers extend your agent with external tools — filesystem, databases, GitHub, Figma, Stripe, etc. Each runs as a background process the agent can call automatically.</div>
        <div id="mcp-list">
          ${(state.cfg.mcpServers ?? []).map((m, i) => `
          <div style="border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;margin-bottom:12px;background:var(--bg3)">
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px">
              <div class="field mb-0" style="flex:1;min-width:180px"><label class="form-label">Server name</label><input class="form-input" id="mcp-name-${i}" value="${esc(m.name ?? '')}" placeholder="github, filesystem, stripe"></div>
              <div class="field mb-0" style="min-width:80px"><label class="form-label">Enabled</label><br><label class="toggle" style="margin-top:6px"><input type="checkbox" id="mcp-on-${i}" ${m.enabled !== false ? 'checked' : ''}><span class="toggle-track"></span></label></div>
              <button class="btn btn-danger btn-sm" style="margin-bottom:2px" onclick="App.removeMCP(${i})">✕ Remove</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">
              <div class="field mb-0" style="width:140px"><label class="form-label">Transport</label>
                <select class="form-select" id="mcp-transport-${i}" onchange="App.onMCPTransportChange(${i})">
                  <option value="stdio" ${!m.transport || m.transport === 'stdio' ? 'selected' : ''}>stdio (local)</option>
                  <option value="sse"   ${m.transport === 'sse' ? 'selected' : ''}>SSE (remote)</option>
                  <option value="streamable-http" ${m.transport === 'streamable-http' ? 'selected' : ''}>HTTP (remote)</option>
                </select>
              </div>
              <div class="field mb-0" id="mcp-cmd-area-${i}" style="flex:1;min-width:200px;${m.transport && m.transport !== 'stdio' ? 'display:none' : ''}">
                <label class="form-label">Start command</label>
                <input class="form-input" id="mcp-cmd-${i}" value="${esc(m.command ?? '')}" placeholder="npx -y @modelcontextprotocol/server-github">
              </div>
              <div class="field mb-0" id="mcp-url-area-${i}" style="flex:1;min-width:200px;${!m.transport || m.transport === 'stdio' ? 'display:none' : ''}">
                <label class="form-label">Server URL</label>
                <input class="form-input" id="mcp-url-${i}" value="${esc(m.url ?? '')}" placeholder="https://mcp.example.com/sse">
              </div>
            </div>
            <div class="field mb-0">
              <label class="form-label">Env vars (KEY=VALUE, one per line — stored in .env)</label>
              <textarea class="form-textarea" id="mcp-env-${i}" style="min-height:60px;font-size:11.5px;font-family:var(--font-mono)" placeholder="GITHUB_TOKEN=ghp_xxxx&#10;STRIPE_KEY=sk_xxxx">${esc((m.env ?? []).join('\n'))}</textarea>
            </div>
          </div>`).join('') || '<div class="empty-state" style="margin:0 0 14px">No MCP servers configured yet.</div>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-ghost" onclick="App.addMCP()">+ Add MCP Server</button>
          <button class="btn btn-ink" onclick="App.saveMCP()">Save MCP Config</button>
        </div>
        <div class="form-hint" style="margin-top:10px">Popular: <code>@modelcontextprotocol/server-filesystem</code>, <code>@modelcontextprotocol/server-github</code>, <code>@modelcontextprotocol/server-postgres</code></div>
      </div>
    </div>
    </div>`;
  } // end viewSettings


  // ── Chat View ─────────────────────────────────────────────────────────────────
  // Returns only providers that have an API key configured in .env
  function getChatModels() {
    const keyMap = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GEMINI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      groq: 'GROQ_API_KEY',
    };
    const result = [];
    for (const [prov, p] of Object.entries(state.providers)) {
      const envKey = keyMap[prov];
      const hasKey = envKey && state.env[envKey] && state.env[envKey] !== '';
      if (hasKey) {
        p.models.forEach(m => result.push({ id: `${prov}/${m}`, name: m, provider: prov, label: p.label }));
      }
    }
    // Always include the current configured model so it's selectable
    const curModel = ag().model;
    if (curModel && !result.find(m => m.id === curModel || curModel.endsWith(m.name))) {
      const prov = providerOf(curModel);
      result.unshift({ id: curModel, name: curModel.split('/').pop(), provider: prov, label: state.providers[prov]?.label ?? prov });
    }
    // If nothing configured just show the current model
    if (!result.length) {
      const cur = ag().model ?? 'anthropic/claude-sonnet-4-5';
      result.push({ id: cur, name: cur.split('/').pop(), provider: providerOf(cur), label: 'Current' });
    }
    return result;
  }

  function viewChat() {
    const agentName = state.cfg.agent?.name || 'Agent';
    const models = getChatModels();
    const activeModel = state.chatModel || ag().model || models[0]?.id || '';
    const activeName = activeModel.split('/').pop();
    const activeProv = models.find(m => m.id === activeModel)?.label ?? providerOf(activeModel);

    const modelItems = models.map(m => `
      <button class="chat-model-item ${m.id === activeModel ? 'active' : ''}" onclick="App.selectChatModel('${esc(m.id)}')">
        <span class="chat-model-name">${esc(m.name)}</span>
        <span class="chat-model-badge">${esc(m.label)}</span>
        ${m.id === activeModel ? '<span class="chat-model-check">\u2713</span>' : ''}
      </button>`).join('');

    // Build command list grouped by category
    const cmds = state.cmds || [];
    const cmdsByCategory = {};
    cmds.forEach(c => {
      const cat = c.category || 'General';
      if (!cmdsByCategory[cat]) cmdsByCategory[cat] = [];
      cmdsByCategory[cat].push(c);
    });
    const cmdPanelItems = Object.entries(cmdsByCategory).map(([cat, items]) => `
      <div class="cmd-panel-group" data-cat="${esc(cat)}">
        <div class="cmd-panel-cat">${esc(cat)}</div>
        ${items.map(c => {
      const raw = c.syntax || c.id || c.command || c.name || '';
      const label = raw.replace(/^\//, '');
      const insertVal = raw.startsWith('/') ? raw : '/' + raw;
      return `
          <button class="cmd-panel-item" onclick="App.insertCmd('${esc(insertVal)}')">
            <div class="cmd-panel-item-top">
              <span class="cmd-panel-slash">/</span><span class="cmd-panel-name">${esc(label)}</span>
            </div>
            <div class="cmd-panel-desc">${esc(c.description || '')}</div>
          </button>`;
    }).join('')}
      </div>`).join('');

    return `
    <div class="page-hd">
      <div>
        <div class="page-title">\ud83d\udcac Chat</div>
        <div class="page-sub">Direct conversation with ${esc(agentName)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="chat-status-pill" class="tag tag-muted">\u25cf Checking...</span>
        <button class="btn btn-ghost btn-sm" onclick="App.clearChat()" title="Clear conversation">\ud83d\uddd1 Clear</button>
      </div>
    </div>

    <div class="chat-layout">

      <!-- LEFT: Chat area -->
      <div class="chat-shell" id="chat-shell">
        <div class="chat-messages" id="chat-messages">
          <div class="chat-welcome">
            <div class="chat-avatar">\ud83e\udd16</div>
            <div class="chat-bubble chat-bubble-agent">
              Hey! I'm <strong>${esc(agentName)}</strong>. Gateway must be running for replies.
              Model: <strong>${esc(activeName)}</strong> \u2014 change below.
            </div>
          </div>
        </div>
        <div id="chat-typing" class="chat-typing" style="display:none">
          <span></span><span></span><span></span>
        </div>
        <div id="chat-file-strip" class="chat-file-strip" style="display:none"></div>
        <div class="chat-input-box" id="chat-input-box">
          <textarea class="chat-input" id="chat-input"
            placeholder="Type a message or /command\u2026 (Enter to send, Shift+Enter for newline)"
            rows="1" oninput="App.chatAutoResize(this)" onkeydown="App.chatKeydown(event)"></textarea>
          <div class="chat-input-footer">
            <div class="chat-input-left">
              <label class="chat-attach-btn" title="Attach files">
                <input type="file" id="chat-file-input" multiple style="display:none" onchange="App.handleChatFiles(this.files)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </label>
              <div class="chat-model-selector" id="chat-model-selector">
                <button class="chat-model-trigger" onclick="App.toggleModelMenu()" title="Switch model">
                  <span id="chat-model-label">${esc(activeName)}</span>
                  <span class="chat-model-provider">${esc(activeProv)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="chat-model-menu" id="chat-model-menu" style="display:none">
                  <div class="chat-model-menu-hd">Switch Model</div>
                  <div class="chat-model-menu-hint">${models.length === 1 ? 'Add API keys in Settings to unlock more.' : `${models.length} models available`}</div>
                  ${modelItems}
                  <div class="chat-model-menu-footer">
                    <button class="chat-model-settings-link" onclick="App.showView('settings')">\u2699 Add API keys in Settings</button>
                  </div>
                </div>
              </div>
            </div>
            <button class="chat-send-btn" id="chat-send-btn" onclick="App.sendChat()" title="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Command panel -->
      <div class="cmd-panel" id="cmd-panel">
        <div class="cmd-panel-hd">
          <span class="cmd-panel-title">\u26a1 Commands</span>
          <span class="cmd-panel-count">${cmds.length}</span>
        </div>
        <div class="cmd-panel-search-wrap">
          <svg class="cmd-panel-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="cmd-panel-search" id="cmd-panel-search" type="text" placeholder="Search commands\u2026" oninput="App.chatCmdSearch(this.value)">
        </div>
        <div class="cmd-panel-list" id="cmd-panel-list">
          ${cmds.length === 0 ? `
            <div class="cmd-panel-empty">
              <div style="font-size:28px;margin-bottom:8px">\ud83d\udccb</div>
              <div style="color:var(--txt3);font-size:13px">No commands yet</div>
              <button class="btn btn-ghost btn-sm" style="margin-top:10px;font-size:12px" onclick="App.showView('commands')">Add Commands \u2192</button>
            </div>` : cmdPanelItems}
        </div>
        <div class="cmd-panel-footer">
          <button class="btn btn-ghost btn-sm" onclick="App.showView('commands')" style="width:100%;font-size:11px">Manage Commands \u2192</button>
        </div>
      </div>

    </div>`;
  }


  // loads history and polls gateway status after chat view is rendered
  async function initChat() {

    // Gateway status pill
    const pill = document.getElementById('chat-status-pill');
    try {
      const s = await api('GET', '/api/gateway/status');
      if (pill) {
        if (s.online) {
          pill.textContent = '● Online'; pill.classList.remove('tag-muted'); pill.classList.add('tag-green');
        } else {
          pill.innerHTML = '● Gateway offline'; pill.classList.add('tag-red');
        }
      }
    } catch { if (pill) { pill.textContent = '● Offline'; pill.classList.add('tag-red'); } }

    // Load persisted history
    try {
      const hist = await api('GET', '/api/chat/history');
      if (Array.isArray(hist) && hist.length) {
        const box = document.getElementById('chat-messages');
        if (box) {
          box.innerHTML = '';
          hist.forEach(m => appendChatBubble(m.role, m.text, m.ts));
        }
      }
    } catch { }

    // focus input
    const inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }

  function appendChatBubble(role, text, ts) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const wrap = document.createElement('div');
    wrap.className = `chat-row chat-row-${role}`;
    const time = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    // Simple markdown: newlines → <br>, code blocks
    const html = esc(text)
      .replace(/```([\s\S]*?)```/g, '<pre class="chat-code"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    wrap.innerHTML = `
      <div class="chat-bubble chat-bubble-${role}">${html}</div>
      <div class="chat-ts">${time}</div>`;
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }

  async function sendChat() {
    const inp = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');
    const typing = document.getElementById('chat-typing');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    inp.value = '';
    inp.style.height = '';
    inp.disabled = true;
    if (btn) btn.disabled = true;

    appendChatBubble('user', text, new Date().toISOString());
    if (typing) typing.style.display = 'flex';
    const box = document.getElementById('chat-messages');
    if (box) box.scrollTop = box.scrollHeight;

    try {
      const model = state.chatModel || ag().model;
      const r = await api('POST', '/api/chat', { message: text, model });
      if (typing) typing.style.display = 'none';
      if (r?.reply) {
        appendChatBubble('assistant', r.reply.text, r.reply.ts);
      } else if (r?.error) {
        appendChatBubble('assistant', `Error: ${r.error}`, new Date().toISOString());
      }
    } catch (e) {
      if (typing) typing.style.display = 'none';
      appendChatBubble('assistant', `Failed to reach server: ${e.message}`, new Date().toISOString());
    }

    inp.disabled = false;
    if (btn) btn.disabled = false;
    inp.focus();
  }

  function chatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  }

  function chatAutoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  // ── Chat model + file handlers ─────────────────────────────────────────────
  function selectChatModel(modelId) {
    state.chatModel = modelId;
    // Update trigger label without full re-render
    const lbl = document.getElementById('chat-model-label');
    if (lbl) lbl.textContent = modelId.split('/').pop();
    const models = getChatModels();
    const provLabel = models.find(m => m.id === modelId)?.label ?? providerOf(modelId);
    const provEl = document.querySelector('.chat-model-provider');
    if (provEl) provEl.textContent = provLabel;
    // Refresh active state on menu items
    document.querySelectorAll('.chat-model-item').forEach(btn => {
      const isActive = btn.onclick?.toString().includes(modelId);
      btn.classList.toggle('active', isActive);
    });
    toggleModelMenu(false);
    toast(`Model: ${modelId.split('/').pop()}`);
  }

  function toggleModelMenu(forceState) {
    const menu = document.getElementById('chat-model-menu');
    if (!menu) return;
    const open = forceState !== undefined ? forceState : menu.style.display === 'none';
    menu.style.display = open ? 'block' : 'none';
    if (open) {
      // Close on outside click
      const close = e => {
        if (!document.getElementById('chat-model-selector')?.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 10);
    }
  }

  function handleChatFiles(files) {
    if (!files || !files.length) return;
    state.chatFiles = [...(state.chatFiles || []), ...Array.from(files)];
    const strip = document.getElementById('chat-file-strip');
    if (!strip) return;
    strip.style.display = 'flex';
    strip.innerHTML = state.chatFiles.map((f, i) => `
      <div class="chat-file-chip">
        <span class="chat-file-chip-name">${esc(f.name)}</span>
        <span class="chat-file-chip-size">${(f.size / 1024).toFixed(0)}KB</span>
        <button onclick="App.removeChatFile(${i})" title="Remove">×</button>
      </div>`).join('');
  }

  function removeChatFile(idx) {
    state.chatFiles.splice(idx, 1);
    handleChatFiles([]); // re-render strip
    if (!state.chatFiles.length) {
      const strip = document.getElementById('chat-file-strip');
      if (strip) strip.style.display = 'none';
    }
  }

  // Filter command panel by search query
  function chatCmdSearch(q) {
    const list = document.getElementById('cmd-panel-list');
    if (!list) return;
    const query = q.toLowerCase().trim();
    list.querySelectorAll('.cmd-panel-item').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.style.display = (!query || text.includes(query)) ? '' : 'none';
    });
    list.querySelectorAll('.cmd-panel-group').forEach(grp => {
      const anyVisible = [...grp.querySelectorAll('.cmd-panel-item')].some(b => b.style.display !== 'none');
      grp.style.display = anyVisible ? '' : 'none';
    });
  }

  // Insert a command into the chat input and focus it
  function insertCmd(cmd) {
    const inp = document.getElementById('chat-input');
    if (!inp) return;
    const text = inp.value;
    // Prepend slash if not already there
    const cmdText = cmd.startsWith('/') ? cmd : '/' + cmd;
    inp.value = text ? text + ' ' + cmdText + ' ' : cmdText + ' ';
    inp.focus();
    inp.dispatchEvent(new Event('input')); // trigger autoresize
    // Scroll input into view
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }

  async function clearChat() {
    if (!confirm('Clear conversation history?')) return;
    await api('DELETE', '/api/chat/history');
    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = `<div class="chat-welcome"><div class="chat-avatar">🤖</div><div class="chat-bubble chat-bubble-agent">Conversation cleared. How can I help?</div></div>`;
  }


  // ── Render ───────────────────────────────────────────────────────────────────
  const VIEWS = { chat: viewChat, overview: viewOverview, channels: viewChannels, agent: viewAgent, settings: viewSettings, commands: viewCommands, workspace: viewWorkspace, antfarm: viewAntfarm, gateway: viewGateway, logs: viewLogs };


  async function render() {
    const el = document.getElementById('main-content');
    if (!el) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'content';
    wrapper.innerHTML = VIEWS[state.view] ? VIEWS[state.view]() : '<div class="empty-state">View not found.</div>';
    el.innerHTML = '';
    el.appendChild(wrapper);
    el.scrollTop = 0;
    if (state.view === 'chat') setTimeout(initChat, 10);
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function saveWA() {
    const allowFrom = val('wa-allowlist').split('\n').map(s => s.trim()).filter(Boolean);
    if (val('wa-number') && !allowFrom.includes(val('wa-number'))) allowFrom.unshift(val('wa-number'));
    const r = await api('PATCH', '/api/channels/whatsapp', {
      enabled: chk('wa-enabled'), allowFrom, dmPolicy: val('wa-dmpolicy'),
      sessionTimeoutMinutes: +val('wa-timeout') || 60, responseDelayMs: +val('wa-delay') || 500,
      format: val('wa-format'), maxMessageLength: +val('wa-maxlen') || 4096,
    });
    if (r.ok) { state.cfg = r.config; toast('WhatsApp saved'); } else toast(r.error || 'Error', 'error');
  }

  async function saveTG() {
    const allowedUserIds = val('tg-userids').split('\n').map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
    const r = await api('PATCH', '/api/channels/telegram', {
      enabled: chk('tg-enabled'), botToken: val('tg-token'), webhookMode: val('tg-webhook'),
      sessionTimeoutMinutes: +val('tg-timeout') || 60, allowedUserIds,
    });
    if (r.ok) { state.cfg = r.config; toast('Telegram saved'); } else toast(r.error || 'Error', 'error');
  }

  async function saveWebhook() {
    const events = [...document.querySelectorAll('.wh-event:checked')].map(e => e.value);
    await saveCfg({ gateway: { webhookUrl: val('wh-url'), webhookSecret: val('wh-secret'), webhookEvents: events } }, 'Webhook');
  }

  async function saveModel() {
    const prov = val('m-prov');
    const modelName = resolveModel('m-model');
    if (!modelName) { toast('Select or type a model', 'error'); return; }
    const model = modelName.includes('/') ? modelName : `${prov}/${modelName}`;
    const apiKey = val('m-apikey').trim();
    const r = await api('POST', '/api/model', {
      provider: prov, model, apiKey,
      temperature: +document.getElementById('m-temp')?.value ?? 1,
      maxTokens: +val('m-maxtok') || 8192, contextWindow: +val('m-context') || 200000,
      thinkingDepth: val('m-think'), format: val('m-format'), verbose: val('m-verbose') === 'on',
    });
    if (r.ok) { state.cfg = r.config; toast(`Model: ${model}`); } else toast(r.error || 'Error', 'error');
  }

  async function saveIdentity() {
    await saveCfg({ agent: { name: val('a-name'), systemPrompt: val('a-system') || undefined }, agents: { defaults: { workspace: val('a-workspace') } } }, 'Identity');
  }

  async function saveHeartbeat() {
    const prov = val('hb-prov'), mdl = val('hb-model');
    await saveCfg({ heartbeat: { enabled: chk('hb-on'), intervalMinutes: +val('hb-interval') || 60, model: `${prov}/${mdl}`, prompt: val('hb-prompt') } }, 'Heartbeat');
  }

  async function saveFallbacks() {
    const fallbackModels = [val('fb-1'), val('fb-2'), val('fb-3')].filter(Boolean);
    await saveCfg({ agents: { defaults: { fallbackModels } } }, 'Fallbacks');
  }

  async function saveToolPerms() {
    const allowedTools = [...document.querySelectorAll('.tool-perm:checked')].map(e => e.value);
    await saveCfg({ agents: { defaults: { allowedTools } } }, 'Tool Permissions');
  }

  async function saveKey(envKey, label) {
    const v = document.getElementById(`key-${envKey}`)?.value.trim();
    if (!v) { toast('Enter a value', 'error'); return; }
    await saveEnv({ [envKey]: v }, label);
    document.getElementById(`key-${envKey}`).value = '';
  }

  async function saveGatewayToken() {
    const newToken = val('gw-token-new').trim();
    const ttl = +val('gw-token-ttl') || 24;
    const patch = { gateway: { tokenTTLHours: ttl } };
    if (newToken) patch.gateway.authToken = newToken;
    await saveCfg(patch, 'Gateway Token');
    const el = document.getElementById('gw-token-new');
    if (el) el.value = '';
    await render();
  }

  async function saveGateway() {
    await saveCfg({ gateway: { port: +val('gw-port') || 18789, bind: val('gw-bind'), maxConnections: +val('gw-maxconn') || 100 } }, 'Network');
  }

  async function saveGatewayAuth() {
    const origins = val('gw-cors').split('\n').map(s => s.trim()).filter(Boolean);
    await saveCfg({ gateway: { authToken: val('gw-authtoken') || undefined, tokenTTLHours: +val('gw-tokttl') || 24, allowedOrigins: origins } }, 'Auth & CORS');
  }

  async function saveRateLimit() {
    await saveCfg({ gateway: { rateLimit: { requestsPerMinute: +val('rl-rpm') || 60, messagesPerHour: +val('rl-mph') || 200, burst: +val('rl-burst') || 10 } } }, 'Rate Limits');
  }

  // ── Settings view actions ────────────────────────────────────────────────────
  async function saveCron() {
    await saveCfg({
      cron: {
        enabled: chk('cron-on'),
        maxConcurrentRuns: +val('cron-maxconc') || 2,
        sessionRetention: val('cron-retention') || '24h',
        runLog: { maxBytes: val('cron-logbytes') || '2mb', keepLines: 2000 },
        webhook: val('cron-webhook') || undefined,
        webhookToken: val('cron-webhooktoken') || undefined,
      }
    }, 'Cron');
  }

  async function saveSession() {
    const mode = val('ses-reset');
    await saveCfg({
      session: {
        dmScope: val('ses-scope'),
        reset: mode === 'never' ? undefined : { mode, atHour: +val('ses-hour') || 4, idleMinutes: +val('ses-idle') || 120 },
        maintenance: { maxEntries: +val('ses-maxentries') || 500, resetArchiveRetention: val('ses-archive') || '30d' },
      }
    }, 'Session');
  }

  async function saveCompaction() {
    await saveCfg({
      agents: {
        defaults: {
          compaction: {
            mode: val('cmp-mode') || 'default',
            reserveTokensFloor: +val('cmp-reserve') || 24000,
            identifierPolicy: val('cmp-ids') || 'strict',
            identifierInstructions: val('cmp-custom-ids') || undefined,
            memoryFlush: { enabled: val('cmp-flush') === 'true' },
          }
        }
      }
    }, 'Compaction');
  }

  async function saveContextPruning() {
    await saveCfg({
      agents: {
        defaults: {
          contextPruning: {
            mode: val('prn-mode') || 'off',
            ttl: val('prn-ttl') || '1h',
            keepLastAssistants: +val('prn-keep') || 3,
            minPrunableToolChars: +val('prn-minchars') || 50000,
            hardClear: { enabled: true, placeholder: val('prn-placeholder') || '[Old tool result cleared]' },
          }
        }
      }
    }, 'Context Pruning');
  }

  async function saveTools() {
    const allTools = ['read', 'write', 'edit', 'apply_patch', 'exec', 'process', 'web_search', 'web_fetch', 'browser', 'canvas', 'image', 'memory_search', 'memory_get', 'sessions_list', 'sessions_send', 'sessions_spawn', 'sessions_history', 'cron', 'gateway', 'nodes'];
    const checked = [...document.querySelectorAll('.tool-perm:checked')].map(e => e.value);
    const deny = allTools.filter(t => !checked.includes(t));
    await saveCfg({ tools: { deny } }, 'Tool Permissions');
  }

  function setAllTools(enable) {
    document.querySelectorAll('.tool-perm').forEach(cb => { cb.checked = enable; });
  }

  async function saveLoopDetection() {
    await saveCfg({
      tools: {
        loopDetection: {
          enabled: val('loop-enabled') === 'true',
          warningThreshold: +val('loop-warn') || 10,
          globalCircuitBreakerThreshold: +val('loop-stop') || 30,
          criticalThreshold: Math.floor((+val('loop-stop') || 30) * 0.7),
          historySize: 30,
          detectors: { genericRepeat: true, knownPollNoProgress: true, pingPong: true },
        }
      }
    }, 'Loop Detection');
  }

  async function saveSubagents() {
    await saveCfg({
      agents: {
        defaults: {
          subagents: {
            model: val('sub-model') || undefined,
            maxConcurrent: +val('sub-max') || 1,
            runTimeoutSeconds: (+val('sub-timeout') || 15) * 60,
            archiveAfterMinutes: +val('sub-archive') || 60,
          }
        }
      }
    }, 'Sub-Agents');
  }

  async function saveMessaging() {
    await saveCfg({
      messages: {
        responsePrefix: val('msg-prefix') || undefined,
        ackReaction: val('msg-ack') || '👀',
        ackReactionScope: val('msg-ackscope') || 'group-mentions',
        removeAckAfterReply: val('msg-removeack') === 'true',
        inbound: { debounceMs: +val('msg-debounce') || 0 },
        queue: { mode: val('msg-queue') || 'collect' },
      }
    }, 'Messaging');
  }

  async function saveHooks() {
    await saveCfg({
      hooks: {
        enabled: chk('hooks-on'),
        path: val('hooks-path') || '/hooks',
        token: val('hooks-token') || undefined,
        defaultSessionKey: val('hooks-sesskey') || 'hook:ingress',
        allowRequestSessionKey: val('hooks-allowsess') === 'true',
        maxBodyBytes: +val('hooks-maxbody') || 262144,
      }
    }, 'Hooks');
  }

  async function saveTTS() {
    const provider = val('tts-prov');
    const patch = {
      messages: {
        tts: {
          auto: val('tts-auto') || 'off',
          provider: provider || undefined,
          openai: provider === 'openai' ? { voice: val('tts-oai-voice') || 'alloy' } : undefined,
          elevenlabs: provider === 'elevenlabs' ? { voiceId: val('tts-el-voice') || undefined } : undefined,
        }
      }
    };
    if (provider === 'elevenlabs' && val('tts-el-key')) {
      await saveEnv({ ELEVENLABS_API_KEY: val('tts-el-key') }, 'ElevenLabs Key');
    }
    await saveCfg(patch, 'TTS');
  }

  async function saveSandbox() {
    await saveCfg({
      agents: {
        defaults: {
          sandbox: {
            mode: val('sbx-mode') || 'off',
            scope: val('sbx-scope') || 'agent',
            workspaceAccess: val('sbx-wsaccess') || 'none',
            docker: {
              memory: val('sbx-mem') || '1g',
              cpus: +val('sbx-cpu') || 1,
              network: val('sbx-net') || 'none',
            },
          }
        }
      }
    }, 'Sandbox');
  }

  async function saveLogging() {
    await saveCfg({
      logging: {
        level: val('log-level') || 'info',
        consoleStyle: val('log-style') || 'pretty',
        redactSensitive: val('log-redact') || 'tools',
        file: val('log-file') || undefined,
      }
    }, 'Logging');
  }

  async function saveWorkspaceDefaults() {
    await saveCfg({
      agents: {
        defaults: {
          bootstrapMaxChars: +val('ws-maxchars') || 20000,
          bootstrapTotalMaxChars: +val('ws-totalmaxchars') || 150000,
          userTimezone: val('ws-tz') || undefined,
          timeFormat: val('ws-timefmt') || 'auto',
          imageMaxDimensionPx: +val('ws-imgpx') || 1200,
          skipBootstrap: val('ws-skip') === 'true',
        }
      }
    }, 'Workspace Defaults');
  }

  // \u2500\u2500 External Services \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async function saveExternalServices() {
    const rows = document.querySelectorAll('.ext-svc-row');
    const services = [...rows].map((_, i) => ({
      name: val(`ext-name-${i}`).trim(),
      baseUrl: val(`ext-url-${i}`).trim(),
      apiKey: val(`ext-key-${i}`).trim() || undefined,
      customHeader: val(`ext-header-${i}`).trim() || undefined,
    })).filter(s => s.name && s.baseUrl);
    const r = await saveCfg({ externalServices: services }, 'External Services');
    if (r?.ok) { state.cfg.externalServices = services; await render(); }
  }

  function addExtSvc() {
    state.cfg.externalServices = [...(state.cfg.externalServices ?? []), { name: '', baseUrl: '', apiKey: '' }];
    render();
    // scroll to the new row
    const list = document.getElementById('ext-svc-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function removeExtSvc(i) {
    state.cfg.externalServices = (state.cfg.externalServices ?? []).filter((_, idx) => idx !== i);
    render();
  }

  // \u2500\u2500 MCP Integrations \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async function saveMCP() {
    const count = document.querySelectorAll('[id^="mcp-name-"]').length;
    const servers = [];
    for (let i = 0; i < count; i++) {
      const name = val(`mcp-name-${i}`).trim();
      if (!name) continue;
      const transport = val(`mcp-transport-${i}`) || 'stdio';
      const envRaw = document.getElementById(`mcp-env-${i}`)?.value ?? '';
      const env = envRaw.split('\n').map(l => l.trim()).filter(Boolean);
      // Persist env vars to .env file via the env API
      const envObj = {};
      env.forEach(line => {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) envObj[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
      });
      if (Object.keys(envObj).length) await api('PATCH', '/api/env', envObj);
      servers.push({
        name,
        enabled: document.getElementById(`mcp-on-${i}`)?.checked ?? true,
        transport,
        command: transport === 'stdio' ? val(`mcp-cmd-${i}`).trim() || undefined : undefined,
        url: transport !== 'stdio' ? val(`mcp-url-${i}`).trim() || undefined : undefined,
        env: env.map(l => l.slice(0, l.indexOf('=')).trim()).filter(Boolean), // store only key names, not values
      });
    }
    const r = await saveCfg({ mcpServers: servers }, 'MCP Servers');
    if (r?.ok) { state.cfg.mcpServers = servers; await render(); }
  }

  function addMCP() {
    state.cfg.mcpServers = [...(state.cfg.mcpServers ?? []), { name: '', transport: 'stdio', enabled: true, command: '', env: [] }];
    render();
    const list = document.getElementById('mcp-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function removeMCP(i) {
    state.cfg.mcpServers = (state.cfg.mcpServers ?? []).filter((_, idx) => idx !== i);
    render();
  }

  function onMCPTransportChange(i) {
    const t = val(`mcp-transport-${i}`);
    const cmdArea = document.getElementById(`mcp-cmd-area-${i}`);
    const urlArea = document.getElementById(`mcp-url-area-${i}`);
    if (cmdArea) cmdArea.style.display = t === 'stdio' ? '' : 'none';
    if (urlArea) urlArea.style.display = t !== 'stdio' ? '' : 'none';
  }

  function onProvChange(provId, modelId) {
    const prov = val(provId);
    const cur = document.getElementById(modelId)?.value;
    const sel = document.getElementById(modelId);
    if (sel) sel.innerHTML = modelOpts(prov, cur);
    const customBox = document.getElementById(modelId + '-custom');
    if (customBox) customBox.style.display = '';
  }

  function onModelChange(selectId) {
    const sel = document.getElementById(selectId);
    const customBox = document.getElementById(selectId + '-custom');
    if (!sel || !customBox) return;
    customBox.style.display = sel.value === '__custom' ? '' : 'none';
  }

  function resolveModel(selectId) {
    // Returns the final model string — either the selected option or the custom text box value
    const sel = document.getElementById(selectId);
    if (!sel) return '';
    if (sel.value === '__custom') {
      return document.getElementById(selectId + '-custom')?.value.trim() ?? '';
    }
    return sel.value;
  }

  async function openFile(name) {
    const r = await api('GET', `/api/workspace/${name}`);
    state.wsSelected = name;
    state.wsContent = r.content ?? '';
    await render();
    document.getElementById('ws-editor')?.focus();
  }
  function closeFile() { state.wsSelected = null; state.wsContent = ''; render(); }
  async function saveFile() {
    const content = document.getElementById('ws-editor')?.value ?? '';
    const r = await api('PUT', `/api/workspace/${state.wsSelected}`, { content });
    if (r.ok) { state.wsContent = content; toast(`${state.wsSelected} saved`); } else toast('Save error', 'error');
  }

  function openCmd(i) {
    const c = state.cmds[i]; if (!c) return;
    const bd = document.querySelector('.backdrop'); if (!bd) return;
    document.getElementById('modal-title').textContent = c.syntax ?? '';
    document.getElementById('modal-body').innerHTML = `
      <div class="modal-syntax">${esc(c.syntax)}</div>
      <div class="modal-desc">${esc(c.description)}</div>
      ${c.exampleOutput ? `<div class="modal-sec">Example Output</div><div class="modal-ex">${esc(c.exampleOutput)}</div>` : ''}
      <div class="modal-sec" style="margin-top:16px">Available On</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${(c.availableChannels ?? []).map(ch => `<span class="tag tag-muted">${esc(ch)}</span>`).join('')}</div>
      ${c.ownerOnly ? '<div class="banner banner-warn" style="margin-top:16px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg> Owner-only command</div>' : ''}
      <div class="mt-16" style="display:flex;gap:8px"><button class="btn btn-ink" onclick="App.copy(null,'${esc(c.syntax)}')">Copy Command</button><button class="btn btn-ghost" onclick="document.querySelector('.backdrop').classList.remove('open')">Close</button></div>`;
    bd.classList.add('open');
  }

  function setCategory(cat) { state.cmdCategory = cat; render(); }
  function onSearch(q) { state.searchQ = q; render(); }

  async function checkAntfarm() {
    const r = await api('GET', '/api/antfarm/status');
    state.antfarmInstalled = r.installed ?? false;
    state.antfarmOutput = r.output ?? r.error ?? '';
    await render();
  }

  async function runWorkflow(id) {
    const task = val(`af-${id}`).trim();
    if (!task) { toast('Enter a task description', 'error'); return; }
    toast(`Starting ${id} workflow…`);
    const r = await api('POST', '/api/antfarm/run', { workflow: id, task });
    state.antfarmOutput = r.output ?? r.error ?? 'Started — check terminal for live output.';
    toast(r.ok ? 'Workflow started' : 'Error: ' + (r.error ?? ''), r.ok ? 'success' : 'error');
    await render();
  }

  async function loadLogs() {
    const r = await api('GET', '/api/logs?limit=100');
    state.logsData = Array.isArray(r) ? r : [];
    await render();
  }

  function pairWA() { toast('Run in terminal: openclaw channels login'); }

  function copy(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Copied');
      if (btn) { btn.textContent = '✓'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500); }
    }).catch(() => toast('Copy failed', 'error'));
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
  async function loadAll() {
    const [cfg, env, cmds, wsFiles, gw] = await Promise.all([
      api('GET', '/api/openclaw'), api('GET', '/api/env'),
      api('GET', '/api/commands'), api('GET', '/api/workspace'),
      api('GET', '/api/gateway/status'),
    ]);
    if (cfg?.agent) state.cfg = cfg;
    state.env = env ?? {};
    state.cmds = Array.isArray(cmds) ? cmds : [];
    state.wsFiles = Array.isArray(wsFiles) ? wsFiles : [];
    state.gatewayOnline = gw?.online ?? false;
  }

  async function showView(name) {
    state.view = name;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'logs' && !state.logsData.length) await loadLogs();
    else await render();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  async function init() {
    await loadAll();
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    const bd = document.querySelector('.backdrop');
    if (bd) {
      bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
      document.getElementById('modal-close')?.addEventListener('click', () => bd.classList.remove('open'));
    }
    await render();
    setInterval(async () => {
      const r = await api('GET', '/api/gateway/status');
      state.gatewayOnline = r?.online ?? false;
      const pill = document.querySelector('.topbar .status-pill');
      if (pill) {
        pill.className = `status-pill${state.gatewayOnline ? ' online' : ''}`;
        pill.innerHTML = state.gatewayOnline ? '<span class="status-dot"></span> Gateway Active' : '<span class="status-dot-off"></span> Gateway Offline';
      }
    }, 30000);
  }

  return {
    showView, saveWA, saveTG, saveWebhook, saveModel, saveIdentity, saveHeartbeat,
    saveFallbacks, saveToolPerms, saveKey, saveGateway, saveGatewayAuth, saveGatewayToken, saveRateLimit,
    onProvChange, onModelChange, resolveModel, openFile, closeFile, saveFile, openCmd, setCategory, onSearch,
    checkAntfarm, runWorkflow, loadLogs, pairWA, copy, loadAll, render, init,
    // Settings view
    saveCron, saveSession, saveCompaction, saveContextPruning, saveTools, setAllTools,
    saveLoopDetection, saveSubagents, saveMessaging, saveHooks, saveTTS, saveSandbox,
    saveLogging, saveWorkspaceDefaults,
    // External services + MCP
    saveExternalServices, addExtSvc, removeExtSvc,
    saveMCP, addMCP, removeMCP, onMCPTransportChange,
    // Chat
    sendChat, chatKeydown, chatAutoResize, clearChat,
    selectChatModel, toggleModelMenu, handleChatFiles, removeChatFile,
    chatCmdSearch, insertCmd,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
