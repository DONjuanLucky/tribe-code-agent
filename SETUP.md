# Tribe Code Agent Installation Guide

## 1. Prerequisites
- Node.js version 22+ (Latest LTS recommended)
- Anthropic API Key (for Claude 3.5 Sonnet / Haiku)

## 2. Server setup (MacOS / Linux)
1. Clone this repository to `/Users/pro/TRIBECODEOPENCLAW` (or any equivalent directory).
2. Install the core OpenClaw daemon:
   ```bash
   npm install -g openclaw@latest
   ```
3. Copy the `.env.example` in this repo to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   # Add your ANTHROPIC_API_KEY inside .env
   ```

## 3. Link Workspace
By default, OpenClaw creates a `~/.openclaw` directory. To use the Tribe Code agent identity, you need to point the config to this repo's workspace folder.

1. Open `~/.openclaw/openclaw.json` (Create it if it doesn't exist)
2. Add or update the agents section:
   ```json
   {
     "agents": {
       "defaults": {
         "workspace": "/Users/pro/TRIBECODEOPENCLAW/workspace"
       }
     }
   }
   ```

## 4. Run the Agent
To start the heartbeat and listen for commands:
```bash
openclaw daemon start
```

## 5. View Control UI
Instead of using the default OpenClaw generic UI, start the custom Tribe UI server:
```bash
cd tribe-ui
npm install
npm run serve
```
Then visit `http://localhost:5173`.
