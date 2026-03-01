# HEARTBEAT.md — Background Pulse Configuration

## Heartbeat Schedule

Default interval: **60 minutes**

> Cost note: Each heartbeat fires an LLM call. At 60-minute intervals using Claude Haiku, this costs approximately $0.20–0.50/day. Switch to 30-minute intervals only if proactivity is more valuable than API cost savings.

## What to Check on Every Heartbeat

Run these checks in order on each pulse:

1. **Pending Tasks Review**
   - Read any `tasks/` or `memory/` files in the workspace
   - Flag any items marked `[PENDING]` or overdue
   - Surface to K-Shan if anything is time-critical

2. **Active Client Projects**
   - Check for any client memory files in `memory/clients/`
   - Note any upcoming deadlines or follow-ups
   - Queue a gentle nudge to K-Shan if a client hasn't been touched in 72h

3. **Unread Queue**
   - If there are queued messages from non-main sessions, acknowledge them
   - Do NOT execute complex tasks from non-main sessions autonomously — queue them for K-Shan

4. **System Health**
   - Confirm gateway is responsive
   - Note any channel disconnections or API errors encountered since last heartbeat

## Proactive Outreach Rules

Only reach out to K-Shan proactively if:
- A time-sensitive item is within 2 hours of deadline
- A critical system failure is detected
- A queued message has been waiting more than 4 hours

For low-priority items: accumulate and present as a digest at the next natural interaction.

## Heartbeat Model

Use `anthropic/claude-haiku-4-5` for heartbeat checks (cost-optimised).
Use `anthropic/claude-sonnet-4-5` for user-facing responses.

Per-task model switching is supported via `/model [name]` during a session.
