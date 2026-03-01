// ==UserScript==
// @name         Tribe Code Agent — Control UI Overlay
// @namespace    https://tribecode.ai
// @version      1.0.0
// @description  Adds inline help panels and a Commands tab to the OpenClaw Control UI
// @author       Tribe Code
// @match        http://127.0.0.1:18789/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────
  const BASE_PATH = window.location.origin;
  const HELP_URL = '/tribe-ui/HelpContent.json';
  const COMMANDS_URL = '/tribe-ui/CommandsList.json';
  const TRIBE_ORANGE = '#E8621A';
  const TRIBE_DARK = '#1A1A1A';
  const TRIBE_CARD = '#2A2A2A';
  const TRIBE_BORDER = '#3A3A3A';

  // ─── CSS ────────────────────────────────────────────────────────────────────
  const styles = `
    /* ── Tribe Brand Injection ── */
    #tribe-brand-badge {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, ${TRIBE_ORANGE}, #c94f10);
      color: white;
      font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 6px 12px;
      border-radius: 20px;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(232, 98, 26, 0.5);
      cursor: default;
    }

    /* ── Help Icon Buttons ── */
    .tribe-help-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${TRIBE_ORANGE};
      color: white;
      font-size: 10px;
      font-weight: 700;
      font-family: 'Inter', system-ui, sans-serif;
      cursor: pointer;
      border: none;
      margin-left: 8px;
      vertical-align: middle;
      flex-shrink: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 2px 8px rgba(232, 98, 26, 0.4);
    }
    .tribe-help-btn:hover {
      transform: scale(1.15);
      box-shadow: 0 4px 14px rgba(232, 98, 26, 0.6);
    }

    /* ── Modal Backdrop ── */
    .tribe-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: tribeBackdropIn 0.2s ease;
    }
    @keyframes tribeBackdropIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ── Help Modal ── */
    .tribe-modal {
      background: ${TRIBE_DARK};
      border: 1px solid ${TRIBE_BORDER};
      border-radius: 16px;
      padding: 28px;
      max-width: 540px;
      width: calc(100% - 48px);
      color: #E8E8E8;
      font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
      animation: tribeModalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      max-height: 85vh;
      overflow-y: auto;
    }
    @keyframes tribeModalIn {
      from { opacity: 0; transform: scale(0.92) translateY(16px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .tribe-modal h2 {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 700;
      color: #FFFFFF;
    }
    .tribe-modal .tribe-modal-subtitle {
      font-size: 13px;
      color: #9A9A9A;
      margin: 0 0 20px;
      line-height: 1.5;
      border-bottom: 1px solid ${TRIBE_BORDER};
      padding-bottom: 16px;
    }
    .tribe-modal h3 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${TRIBE_ORANGE};
      margin: 20px 0 8px;
    }
    .tribe-modal p, .tribe-modal li {
      font-size: 13px;
      line-height: 1.65;
      color: #C8C8C8;
    }
    .tribe-modal ul {
      margin: 0;
      padding-left: 18px;
    }
    .tribe-modal li { margin-bottom: 4px; }
    .tribe-modal code {
      background: #333;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 11px;
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
      color: ${TRIBE_ORANGE};
    }
    .tribe-modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: ${TRIBE_CARD};
      border: 1px solid ${TRIBE_BORDER};
      color: #9A9A9A;
      border-radius: 8px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .tribe-modal-close:hover { background: #333; color: white; }
    .tribe-modal-section {
      background: ${TRIBE_CARD};
      border: 1px solid ${TRIBE_BORDER};
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .tribe-modal-examples {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tribe-example-row {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }
    .tribe-example-key {
      color: #777;
      min-width: 120px;
      flex-shrink: 0;
    }
    .tribe-example-val {
      color: #ddd;
      font-family: 'SF Mono', monospace;
      font-size: 11px;
    }

    /* ── Commands Panel Tab ── */
    #tribe-commands-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 10px;
      background: linear-gradient(135deg, ${TRIBE_ORANGE}, #c94f10);
      color: white;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin: 12px;
      border: none;
      box-shadow: 0 4px 16px rgba(232, 98, 26, 0.4);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    #tribe-commands-tab:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(232, 98, 26, 0.6);
    }

    /* ── Commands Panel ── */
    #tribe-commands-panel {
      position: fixed;
      inset: 0;
      background: ${TRIBE_DARK};
      z-index: 99999;
      display: flex;
      flex-direction: column;
      font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
      animation: tribePanelIn 0.3s cubic-bezier(0.34, 1.3, 0.64, 1);
    }
    @keyframes tribePanelIn {
      from { opacity: 0; transform: translateX(40px); }
      to { opacity: 1; transform: translateX(0); }
    }
    #tribe-commands-panel .panel-header {
      background: linear-gradient(135deg, ${TRIBE_ORANGE} 0%, #c94f10 100%);
      padding: 20px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #tribe-commands-panel .panel-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: white;
      letter-spacing: -0.02em;
    }
    #tribe-commands-panel .panel-header p {
      margin: 2px 0 0;
      font-size: 12px;
      color: rgba(255,255,255,0.75);
    }
    #tribe-commands-panel .panel-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      border-radius: 10px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    #tribe-commands-panel .panel-close:hover { background: rgba(255,255,255,0.35); }
    #tribe-commands-panel .panel-search {
      padding: 16px 28px;
      background: #111;
      border-bottom: 1px solid ${TRIBE_BORDER};
      flex-shrink: 0;
    }
    #tribe-cmd-search {
      width: 100%;
      background: ${TRIBE_CARD};
      border: 1px solid ${TRIBE_BORDER};
      border-radius: 10px;
      padding: 10px 16px;
      color: #E8E8E8;
      font-size: 14px;
      font-family: inherit;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s;
    }
    #tribe-cmd-search:focus { border-color: ${TRIBE_ORANGE}; }
    #tribe-cmd-search::placeholder { color: #555; }
    #tribe-commands-panel .panel-body {
      overflow-y: auto;
      padding: 20px 28px;
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-content: start;
    }
    @media (max-width: 900px) {
      #tribe-commands-panel .panel-body { grid-template-columns: 1fr; }
    }
    .tribe-cmd-card {
      background: ${TRIBE_CARD};
      border: 1px solid ${TRIBE_BORDER};
      border-radius: 12px;
      padding: 16px;
      transition: border-color 0.15s, transform 0.15s;
    }
    .tribe-cmd-card:hover {
      border-color: ${TRIBE_ORANGE};
      transform: translateY(-2px);
    }
    .tribe-cmd-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
    }
    .tribe-cmd-syntax {
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      font-weight: 700;
      color: ${TRIBE_ORANGE};
      background: rgba(232, 98, 26, 0.12);
      border: 1px solid rgba(232, 98, 26, 0.3);
      border-radius: 6px;
      padding: 3px 8px;
      white-space: nowrap;
    }
    .tribe-cmd-badges {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .tribe-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .tribe-badge-owner {
      background: rgba(255, 200, 50, 0.15);
      color: #FFC832;
      border: 1px solid rgba(255, 200, 50, 0.3);
    }
    .tribe-badge-open {
      background: rgba(80, 200, 120, 0.15);
      color: #50C878;
      border: 1px solid rgba(80, 200, 120, 0.3);
    }
    .tribe-cmd-desc {
      font-size: 12px;
      color: #AAAAAA;
      line-height: 1.55;
      margin: 0 0 10px;
    }
    .tribe-cmd-example {
      background: #111;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 8px 10px;
      font-family: 'SF Mono', monospace;
      font-size: 10px;
      color: #888;
      margin-bottom: 10px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .tribe-cmd-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tribe-channels-list {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .tribe-channel-pill {
      font-size: 9px;
      background: #333;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 1px 5px;
      color: #888;
    }
    .tribe-copy-btn {
      background: rgba(232, 98, 26, 0.1);
      border: 1px solid rgba(232, 98, 26, 0.3);
      color: ${TRIBE_ORANGE};
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, transform 0.1s;
    }
    .tribe-copy-btn:hover { background: rgba(232, 98, 26, 0.25); }
    .tribe-copy-btn:active { transform: scale(0.95); }
    .tribe-copy-btn.copied {
      background: rgba(80, 200, 120, 0.15);
      border-color: rgba(80, 200, 120, 0.4);
      color: #50C878;
    }
    #tribe-cmd-count {
      font-size: 11px;
      color: #555;
      padding: 0 28px 8px;
      flex-shrink: 0;
    }
  `;

  // ─── Inject Styles ───────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ─── State ──────────────────────────────────────────────────────────────────
  let helpContent = null;
  let commandsList = null;

  // ─── Data Loading ────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      // Try to load from the server (when deployed alongside OpenClaw)
      const [helpRes, cmdRes] = await Promise.allSettled([
        fetch(HELP_URL),
        fetch(COMMANDS_URL)
      ]);
      if (helpRes.status === 'fulfilled' && helpRes.value.ok) {
        helpContent = await helpRes.value.json();
      }
      if (cmdRes.status === 'fulfilled' && cmdRes.value.ok) {
        commandsList = await cmdRes.value.json();
      }
    } catch {
      // Fallback: data is bundled inline below
    }

    // Inline fallbacks (from bundled JSON at build time)
    if (!helpContent) helpContent = BUNDLED_HELP;
    if (!commandsList) commandsList = BUNDLED_COMMANDS;
  }

  // ─── Help Modal ──────────────────────────────────────────────────────────────
  function openHelpModal(sectionKey) {
    const section = helpContent[sectionKey];
    if (!section) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'tribe-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'tribe-modal';
    modal.style.position = 'relative';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tribe-modal-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => backdrop.remove();

    let mistakesHtml = '';
    if (section.commonMistakes && section.commonMistakes.length) {
      mistakesHtml = `
        <h3>⚠ Common Mistakes</h3>
        <div class="tribe-modal-section">
          <ul>${section.commonMistakes.map(m => `<li>${m}</li>`).join('')}</ul>
        </div>
      `;
    }

    let examplesHtml = '';
    if (section.exampleValues && Object.keys(section.exampleValues).length) {
      const rows = Object.entries(section.exampleValues).map(([k, v]) => `
        <div class="tribe-example-row">
          <span class="tribe-example-key">${k}</span>
          <span class="tribe-example-val">${v}</span>
        </div>
      `).join('');
      examplesHtml = `
        <h3>📋 Example Values</h3>
        <div class="tribe-modal-section tribe-modal-examples">${rows}</div>
      `;
    }

    modal.innerHTML = `
      <h2>💡 ${section.title}</h2>
      <p class="tribe-modal-subtitle">${section.summary}</p>
      <h3>What This Does</h3>
      <div class="tribe-modal-section"><p>${section.details}</p></div>
      ${mistakesHtml}
      ${examplesHtml}
    `;
    modal.appendChild(closeBtn);
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', escHandler); }
    });
    document.body.appendChild(backdrop);
  }

  // ─── Help Button Injection ───────────────────────────────────────────────────
  function injectHelpButtons() {
    if (!helpContent) return;

    // Map section headings/labels to help content keys
    const sectionMap = {
      'Gateway': 'gateway',
      'Channels': 'channels',
      'WhatsApp': 'whatsapp',
      'Model': 'models',
      'Models': 'models',
      'Heartbeat': 'heartbeat',
      'Soul': 'soul',
      'Skills': 'skills',
      'Sessions': 'sessions',
    };

    // Inject ? buttons next to headings and labels
    document.querySelectorAll('h1, h2, h3, h4, label, [data-section]').forEach(el => {
      if (el.dataset.tribeHelped) return;
      const text = el.textContent.trim();
      const key = Object.keys(sectionMap).find(k => text.includes(k));
      if (!key) return;

      el.dataset.tribeHelped = '1';
      const btn = document.createElement('button');
      btn.className = 'tribe-help-btn';
      btn.textContent = '?';
      btn.title = `What is ${key}?`;
      btn.onclick = (e) => { e.stopPropagation(); openHelpModal(sectionMap[key]); };
      el.appendChild(btn);
    });
  }

  // ─── Commands Panel ──────────────────────────────────────────────────────────
  function buildCommandCard(cmd) {
    const card = document.createElement('div');
    card.className = 'tribe-cmd-card';
    card.dataset.search = `${cmd.syntax} ${cmd.description} ${cmd.category}`.toLowerCase();

    const badge = cmd.ownerOnly
      ? `<span class="tribe-badge tribe-badge-owner">Owner Only</span>`
      : `<span class="tribe-badge tribe-badge-open">All Users</span>`;

    const channels = cmd.availableChannels
      .map(c => `<span class="tribe-channel-pill">${c}</span>`)
      .join('');

    card.innerHTML = `
      <div class="tribe-cmd-top">
        <span class="tribe-cmd-syntax">${cmd.syntax}</span>
        <div class="tribe-cmd-badges">${badge}</div>
      </div>
      <p class="tribe-cmd-desc">${cmd.description}</p>
      <div class="tribe-cmd-example">${cmd.exampleOutput}</div>
      <div class="tribe-cmd-footer">
        <div class="tribe-channels-list">${channels}</div>
        <button class="tribe-copy-btn" data-cmd="${cmd.syntax}">Copy</button>
      </div>
    `;

    card.querySelector('.tribe-copy-btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard.writeText(cmd.syntax).then(() => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
      });
    });

    return card;
  }

  function openCommandsPanel() {
    if (document.getElementById('tribe-commands-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'tribe-commands-panel';

    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h1>⚡ Commands</h1>
          <p>All available slash commands for Tribe Agent</p>
        </div>
        <button class="panel-close" id="tribe-panel-close">✕</button>
      </div>
      <div class="panel-search">
        <input type="text" id="tribe-cmd-search" placeholder="🔍  Search commands by name, description, or category...">
      </div>
      <div id="tribe-cmd-count"></div>
      <div class="panel-body" id="tribe-cmd-grid"></div>
    `;

    document.body.appendChild(panel);

    const grid = panel.querySelector('#tribe-cmd-grid');
    const cards = commandsList.map(buildCommandCard);
    cards.forEach(c => grid.appendChild(c));

    const countEl = panel.querySelector('#tribe-cmd-count');
    const updateCount = (visible) => {
      countEl.textContent = `Showing ${visible} of ${commandsList.length} commands`;
    };
    updateCount(commandsList.length);

    panel.querySelector('#tribe-cmd-search').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      let visible = 0;
      cards.forEach(card => {
        const match = !query || card.dataset.search.includes(query);
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      updateCount(visible);
    });

    panel.querySelector('#tribe-panel-close').addEventListener('click', () => panel.remove());
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', escHandler); }
    });
  }

  // ─── Commands Tab Button Injection ───────────────────────────────────────────
  function injectCommandsTab() {
    if (document.getElementById('tribe-commands-tab')) return;

    const btn = document.createElement('button');
    btn.id = 'tribe-commands-tab';
    btn.innerHTML = '⚡ Commands';
    btn.onclick = openCommandsPanel;

    // Try to append to nav, sidebar, or fallback to body
    const nav = document.querySelector('nav, [role="navigation"], .sidebar, .nav, header');
    if (nav) {
      nav.appendChild(btn);
    } else {
      btn.style.position = 'fixed';
      btn.style.top = '20px';
      btn.style.right = '20px';
      btn.style.zIndex = '9998';
      document.body.appendChild(btn);
    }
  }

  // ─── Brand Badge ─────────────────────────────────────────────────────────────
  function injectBrandBadge() {
    if (document.getElementById('tribe-brand-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'tribe-brand-badge';
    badge.textContent = '⬡ Tribe Code';
    document.body.appendChild(badge);
  }

  // ─── MutationObserver for SPAs ───────────────────────────────────────────────
  let injectTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectHelpButtons, 400);
  });

  // ─── Bundled Fallback Data ───────────────────────────────────────────────────
  // This is a minimal fallback used when the JSON files are not accessible via fetch.
  const BUNDLED_HELP = {
    gateway: {
      title: "Gateway",
      summary: "The Gateway is the core process that runs everything.",
      details: "Single Node.js process running on port 18789. Controls channels, sessions, tools, and LLM calls. Do not expose this port to the internet.",
      commonMistakes: ["Exposing port 18789 publicly", "Running multiple Gateway instances"],
      exampleValues: { port: "18789", bind: "loopback" }
    },
    channels: {
      title: "Channels",
      summary: "Messaging platform adapters — WhatsApp, Telegram, Slack, etc.",
      details: "Each adapter normalises platform messages into a standard format. Use a dedicated WhatsApp number (not VOIP). Keep dmPolicy set to 'pairing' for safety.",
      commonMistakes: ["Using personal WhatsApp", "Using Google Voice", "Missing allowFrom"],
      exampleValues: { dmPolicy: "'pairing'", allowFrom: "['+15550001234']" }
    }
  };

  const BUNDLED_COMMANDS = [
    { id: "status", syntax: "/status", description: "Compact session status.", exampleOutput: "Model: claude-sonnet-4-5 | Tokens: 4,230", ownerOnly: false, availableChannels: ["WhatsApp", "Telegram", "WebChat"], category: "Session" },
    { id: "reset", syntax: "/reset", description: "Clear session context.", exampleOutput: "Session reset.", ownerOnly: false, availableChannels: ["WhatsApp", "Telegram", "WebChat"], category: "Session" },
    { id: "help", syntax: "/help", description: "Show all commands.", exampleOutput: "Available commands: /status, /reset...", ownerOnly: false, availableChannels: ["WhatsApp", "Telegram", "WebChat"], category: "Info" },
    { id: "heartbeat", syntax: "/heartbeat", description: "Trigger heartbeat manually.", exampleOutput: "Heartbeat triggered.", ownerOnly: true, availableChannels: ["WhatsApp", "Telegram"], category: "Automation" },
    { id: "model", syntax: "/model [name]", description: "Switch active model.", exampleOutput: "Model switched to claude-haiku-4-5.", ownerOnly: true, availableChannels: ["WhatsApp", "Telegram", "WebChat"], category: "Config" },
    { id: "stop", syntax: "/stop", description: "Stop current run.", exampleOutput: "Run interrupted.", ownerOnly: true, availableChannels: ["WhatsApp", "Telegram", "WebChat"], category: "Control" }
  ];

  // ─── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    await loadData();
    injectBrandBadge();
    injectCommandsTab();
    injectHelpButtons();

    // Watch for DOM changes (SPA navigation)
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
