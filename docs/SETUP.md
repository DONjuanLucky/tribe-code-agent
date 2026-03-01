# SETUP.md — Tribe Code Agent Setup Guide

## Prerequisites

Before starting, make sure you have:
- [ ] Mac or Linux server (VPS strongly preferred for 24/7 uptime)
- [ ] Node.js v22+ installed
- [ ] A dedicated WhatsApp phone number (physical SIM, not VOIP)
- [ ] An Anthropic API key

---

## Step 1: Install Node.js v22+

```bash
# Check current version
node --version

# If < 22, install via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

---

## Step 2: Install OpenClaw

```bash
npm install -g openclaw@latest

# Verify installation
openclaw --version
```

---

## Step 3: Set Up Your Credentials

```bash
# Copy environment template
cp /Users/pro/TRIBECODEOPENCLAW/.env.example /Users/pro/TRIBECODEOPENCLAW/.env

# Edit your .env file
nano /Users/pro/TRIBECODEOPENCLAW/.env
```

Fill in:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `WHATSAPP_NUMBER` — your dedicated WhatsApp SIM number in E.164 format (e.g. `+15550001234`)

---

## Step 4: Link OpenClaw Config

```bash
# Point OpenClaw to this repo's config
cp /Users/pro/TRIBECODEOPENCLAW/openclaw.json ~/.openclaw/openclaw.json

# Create workspace symlink (so OpenClaw reads your soul files)
mkdir -p ~/.openclaw
ln -s /Users/pro/TRIBECODEOPENCLAW/workspace ~/.openclaw/workspace
```

---

## Step 5: Run the Onboarding Wizard

```bash
openclaw onboard --install-daemon
```

When prompted:

| Prompt | What to Enter |
|---|---|
| API Provider | `anthropic` |
| Model | `claude-sonnet-4-5` |
| Workspace path | `/Users/pro/TRIBECODEOPENCLAW/workspace` |
| Install daemon | `yes` |

---

## Step 6: Link Your WhatsApp

```bash
openclaw channels login
```

A QR code will appear in your terminal. Open WhatsApp on your dedicated phone:
1. Tap the three dots menu → Linked Devices
2. Tap Link a Device
3. Scan the QR code

Wait for "WhatsApp linked successfully." to appear.

---

## Step 7: Start the Gateway

```bash
# Start gateway (foreground, for testing)
openclaw start

# Open Control UI in browser
open http://127.0.0.1:18789/
```

---

## Step 8: Install the Tribe UI Overlay

For persistent automatic injection (recommended):
1. Install **Tampermonkey** extension in Chrome: [tampermonkey.net](https://www.tampermonkey.net/)
2. Open Tampermonkey Dashboard → Utilities → Import from File
3. Select `/Users/pro/TRIBECODEOPENCLAW/tribe-ui/tribe-injector.user.js`
4. Click Install
5. Reload `http://127.0.0.1:18789/` — you'll see `?` buttons and a Commands tab

For one-off testing (without Tampermonkey):
1. Open `http://127.0.0.1:18789/` in Chrome
2. Open DevTools (Cmd+Option+J)
3. Paste the entire contents of `tribe-injector.user.js` into the console
4. Press Enter

For offline preview (no OpenClaw required):
```bash
open /Users/pro/TRIBECODEOPENCLAW/tribe-ui/index.html
```

---

## Step 9: Verify the Agent Works

Send a message to your WhatsApp agent number: `hello`

Expected response: `Hey, I'm Tribe — K-Shan's AI agent at Tribe Code...`

Try a slash command: `/status`

Expected response: Model, token count, and channel status.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `openclaw: command not found` | Run `npm install -g openclaw@latest` again |
| WhatsApp QR code expired | Run `openclaw channels login` again |
| Control UI unreachable | Check gateway is running with `openclaw status` |
| Agent not responding | Check `ANTHROPIC_API_KEY` is set in `.env` |
| Tampermonkey script not injecting | Check the script is enabled in the dashboard |
