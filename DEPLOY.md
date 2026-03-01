# Tribe Code Agent VPS Deployment

When you're ready to deploy the Tribe Code Agent to a 24/7 VPS (e.g., Ubuntu on Hetzner/DigitalOcean):

## 1. Environment Setup
1. **Provision Ubuntu 24.04 LTS**
   - 2GB+ RAM recommended
2. **Install Node 22**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. **Install Build Tools & PM2**
   ```bash
   sudo apt install build-essential git
   npm install -g pm2 openclaw@latest
   ```

## 2. Clone Workspace
Clone your fork of `TRIBECODEOPENCLAW` to the VPS:
```bash
git clone https://github.com/TribeCode/OpenClaw.git /opt/tribe-openclaw
cd /opt/tribe-openclaw
```
Set up the `.env` file with Production API keys.

## 3. Configure OpenClaw
Run `openclaw onboard` to go through the initial setup, ensuring you map the custom workspace directory:
```bash
openclaw config set agents.defaults.workspace /opt/tribe-openclaw/workspace
```

## 4. Start Daemons with PM2
To keep the agent and the custom UI alive 24/7:
```bash
# Start the OpenClaw daemon
pm2 start "openclaw start" --name "tribe-agent"

# Start the Custom UI (Optional, if you want external web access)
cd /opt/tribe-openclaw/tribe-ui
npm install
pm2 start "node server.js" --name "tribe-ui"

# Save PM2 state
pm2 save
pm2 startup
```

## 5. Review Logs
- OpenClaw logs: `pm2 logs tribe-agent`
- Check memory persistence: `tail -f ~/.openclaw/logs/heartbeat.log`
