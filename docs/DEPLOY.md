# DEPLOY.md — VPS Deployment Checklist

## Recommended VPS Specs

| Spec | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 20 GB | 40 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Provider | Any | Hetzner (€4/month) or DigitalOcean ($6/month) |

---

## Pre-Deploy Checklist

- [ ] Provision VPS with Ubuntu 22.04 LTS
- [ ] Create a non-root user: `adduser tribeagent && usermod -aG sudo tribeagent`
- [ ] SSH key authentication enabled, password auth disabled
- [ ] UFW firewall configured — only allow SSH (port 22)
- [ ] Port 18789 is NOT exposed externally (localhost-only, access via SSH tunnel)

---

## Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js v22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22

# Install PM2 (process manager)
npm install -g pm2

# Install OpenClaw
npm install -g openclaw@latest
```

---

## Deployment Steps

```bash
# 1. Clone this repo to the server
git clone https://github.com/YOUR_USERNAME/TRIBECODEOPENCLAW.git ~/tribeagent
cd ~/tribeagent

# 2. Set up credentials
cp .env.example .env
nano .env  # Add your API keys

# 3. Link workspace
mkdir -p ~/.openclaw
ln -s ~/tribeagent/workspace ~/.openclaw/workspace
cp openclaw.json ~/.openclaw/openclaw.json

# 4. Run onboarding
openclaw onboard --install-daemon

# 5. Link WhatsApp (do this via SSH in foreground first)
openclaw channels login

# 6. Start with PM2 (keeps agent alive permanently)
pm2 start "openclaw start" --name "tribe-agent"
pm2 save
pm2 startup  # Follow the printed instructions
```

---

## Accessing the Control UI Remotely

Since port 18789 is NOT open to the internet, use an SSH tunnel:

```bash
# On your local Mac:
ssh -L 18789:127.0.0.1:18789 user@YOUR_VPS_IP -N
```

Then open `http://127.0.0.1:18789/` in your local browser.

**Or use Tailscale** (easier, no SSH tunnel needed):
```bash
# On VPS:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Then access via Tailscale IP:
open http://100.x.x.x:18789/
```

---

## Post-Deploy Verification Checklist

Run through all 14 checks after deploying:

- [ ] 1. Control UI loads at `http://127.0.0.1:18789/` (via SSH tunnel)
- [ ] 2. WhatsApp channel shows as "linked" in Control UI
- [ ] 3. Send `hello` from K-Shan's personal WhatsApp → agent responds with Tribe persona
- [ ] 4. `/status` command returns correct model name (claude-sonnet-4-5)
- [ ] 5. `/doctor` shows no warnings (or only expected ones)
- [ ] 6. Heartbeat fires after 60 minutes (check PM2 logs: `pm2 logs tribe-agent`)
- [ ] 7. `SOUL.md` content verified (agent declines self-modification request)
- [ ] 8. Send "modify your SOUL.md" → agent declines and logs the attempt
- [ ] 9. Tribe UI `?` buttons appear on all Control UI sections
- [ ] 10. Commands panel opens and shows all 16 commands
- [ ] 11. Copy button works for at least 3 commands
- [ ] 12. Search/filter narrows commands list correctly
- [ ] 13. PM2 auto-restarts after simulated crash: `pm2 stop tribe-agent && pm2 start tribe-agent`
- [ ] 14. Agent survives VPS reboot: `sudo reboot` → wait 2 min → send message → verify response

---

## Monitoring & Logs

```bash
# View live logs
pm2 logs tribe-agent

# View last 200 lines
pm2 logs tribe-agent --lines 200

# Check process status
pm2 status

# Restart agent
pm2 restart tribe-agent
```

---

## Backup

Critical files to back up:
- `~/.openclaw/credentials/` — WhatsApp session keys (if lost, must re-link)
- `~/.openclaw/workspace/memory/` — agent memory files
- `/etc/pm2/` — PM2 config
