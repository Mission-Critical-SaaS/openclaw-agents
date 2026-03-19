# OpenClaw Agent Capability Matrix

Comprehensive reference for the six agents running in the OpenClaw gateway, documenting roles, tool access, and integration points.

---

## Agent Overview

Six agents run in the OpenClaw gateway, each with distinct roles:

### Scout — Customer Support Specialist
- **Slack Bot User ID**: U0AJLT30KMG
- **DM Channel**: D0AJLT5QTNE
- **Primary tools**: Jira (MCP), Zendesk (MCP)
- **Secondary tools**: GitHub (gh CLI, limited to issue search only)
- **Personality**: Warm, patient, thorough. Explains clearly, follows up proactively.
- **Jira Projects**: LMNTL (Platform), M7 (Minute7), HK (Hour Timesheet), MCSP (Customer Support), MO (Operations), MM (Marketing), GTMS (Go to market)
- **Zendesk Site**: minute7.zendesk.com
- **Key behaviors**: Greets users, asks clarifying questions, searches Zendesk for existing tickets before creating new ones, cross-references Jira for known bugs

### Trak — Project Management Specialist
- **Slack Bot User ID**: U0AJEGUSELB
- **DM Channel**: D0AJEHFN93M
- **Primary tools**: Jira (MCP)
- **Secondary tools**: GitHub (gh CLI, full access)
- **Personality**: Organized, data-driven, proactive about blockers
- **Focus areas**: Sprint status, issue tracking, progress summaries, blocker flagging
- **Key behaviors**: Provides sprint summaries, identifies blocked/stale tickets, tracks velocity, links PRs to issues

### Kit — Engineering/Dev Assistant
- **Slack Bot User ID**: U0AKF614URE
- **DM Channel**: D0AJJRPGS7Q
- **Primary tools**: GitHub (gh CLI, full access)
- **Secondary tools**: Jira (MCP, limited)
- **Personality**: Technical, efficient, code-focused
- **GitHub Org**: LMNTL-AI
- **Key repos**: lmntl, service-platform, web-platform, mobile-platform, web-admin-dashboard, infra-*, tools, e2e-test, marketing-site, brand-system
- **Key behaviors**: Reviews PRs, checks CI status, searches code, links Jira issues to PRs

### Beacon — HourTimesheet Internal Support Agent
- **Slack Bot User ID**: U0AMPKFH5D4
- **DM Channel**: TBD
- **Primary tools**: Jira (MCP, HK project), Zendesk (MCP)
- **Secondary tools**: Notion (MCP, read-only), GitHub (gh CLI, limited to issues only)
- **Personality**: Supportive, detail-oriented, focused on internal processes
- **Jira Projects**: HK (Hour Timesheet)
- **Zendesk Site**: minute7.zendesk.com
- **Key behaviors**: Handles internal support queries related to Hour Timesheet, searches Jira HK project, manages internal tickets in Zendesk

---

## Tool Access Matrix

| Tool | Scout | Trak | Kit | Scribe | Probe | Beacon |
|------|-------|------|-----|--------|-------|--------|
| **Jira** (MCP) | ✅ Full — ticket lookup, creation, search | ✅ Full (primary) — sprint tracking, issue management | ⚠️ Limited — issue lookup only | | | ✅ Full — HK project focus |
| **Zendesk** (MCP) | ✅ Full — ticket search, create, update, comments | ❌ Not configured | ❌ Not configured | | | ✅ Full |
| **Notion** (MCP) | ❌ Not configured | ❌ Not configured | ❌ Not configured | | | ⚠️ Read-only |
| **GitHub** (gh CLI) | ⚠️ Limited — issue search only | ✅ Full — PRs, issues, repos | ✅ Full (primary) — PRs, CI, code review | | | ⚠️ Limited — issues only |

**Note**: Notion is available as an MCP server but not yet assigned to all agents' identities. Agents CAN access it if their IDENTITY.md is updated.

---

## How Tool Access Works

Tool access is controlled at TWO levels:

### 1. MCP Server Level
All MCP servers (Jira, Zendesk, Notion) are available to all agents via the shared MCP server configuration. The inner entrypoint (`docker/entrypoint.sh`) generates this config at `/root/.mcporter/mcporter.json` on each container start.

### 2. Agent Identity Level
Each agent's `IDENTITY.md` file defines which tools the agent should USE. The gateway doesn't restrict tool access — agents self-select based on their identity instructions. An agent without Zendesk in its IDENTITY.md can technically access Zendesk tools but won't know to do so.

### Making Tool Access Changes

Tool access changes require:
- Editing the agent's IDENTITY.md file (on the host at `/opt/openclaw/agents/<name>/workspace/IDENTITY.md`)
- Restarting the container so the agent picks up the new identity

---

## MCP Tool Reference

### Jira Tools (5)
- `jira.jira_get` — Read any Jira data (issues, projects, sprints, users)
- `jira.jira_post` — Create issues, comments, worklogs
- `jira.jira_put` — Full update of issues, projects
- `jira.jira_patch` — Partial update of issues, comments
- `jira.jira_delete` — Delete issues, comments, attachments

### Zendesk Tools (8)
- `zendesk.zendesk_get_ticket` — Get ticket by ID
- `zendesk.zendesk_update_ticket` — Update ticket properties
- `zendesk.zendesk_create_ticket` — Create new ticket
- `zendesk.zendesk_add_private_note` — Add internal note
- `zendesk.zendesk_add_public_note` — Add public comment
- `zendesk.zendesk_search` — Search tickets
- `zendesk.zendesk_get_ticket_details` — Get ticket with comments
- `zendesk.zendesk_get_linked_incidents` — Get linked incidents

### Notion Tools (22)
- `notion.API-post-search` — Search by title
- `notion.API-retrieve-a-page` — Get page content
- `notion.API-post-page` — Create page
- `notion.API-patch-page` — Update page properties
- `notion.API-get-block-children` — Get block children
- `notion.API-patch-block-children` — Append block children
- (plus 16 more — retrieve/update/delete blocks, databases, comments, users, data sources)

### GitHub Tools (via gh CLI, not MCP)
- `gh issue list/view/create/edit/close`
- `gh pr list/view/create/review/merge/checks`
- `gh search issues/prs/repos/code`
- `gh repo view/clone`
- `gh run list/view/watch`
- `gh api` (raw API calls)

---

## Testing Each Agent

### Quick Smoke Test (DM each agent)
```
Scout: "Search Zendesk for open tickets"
Trak: "Show me the top 5 open bugs in the LMNTL project"
Kit: "Check the CI status for the latest PR on lmntl repo"
```

### Integration Verification
```bash
# On EC2, verify MCP server health
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    openclaw status
'
# Expected: 3 servers, all healthy

# Verify each agent's identity is loaded
for agent in scout trak kit scribe probe beacon; do
  docker exec openclaw-agents head -3 /root/.openclaw/agents/$agent/workspace/IDENTITY.md
done
```

---

## Slack Configuration Reference

| Setting | Value |
|---------|-------|
| Workspace | lmntlai.slack.com |
| Key Channels | #leads (C089JBLCFLL), #dev (C086N5031LZ), #agentic-dev (C0AKWU052CW), #sdlc-reviews (PR ensemble reviews) |
| groupPolicy | `open` (respond in any channel when @mentioned) |
| requireMention | `true` (all agents) |
| streaming | `off` (disabled — prevents leaked channel messages; must be `'off'` not `'none'`) |
| Allowed Users | 9+ users — see README for current list (Beacon's Bot User ID to be added when app is created) |

---

## Specialist Agent Integration

All six agents have access to 13 specialist agent personas in `agents/shared/specialists/`. These provide deep domain expertise for the 7-dimension ensemble audit protocol.

### Specialist-to-Dimension Mapping

| # | Dimension | Primary Agent | Specialist Persona |
|---|-----------|---------------|--------------------|
| 1 | Correctness | Kit | code-review-architect |
| 2 | Security | Kit | security-risk-auditor |
| 3 | UX/Accessibility | Scout | ux-ui-designer |
| 4 | Product-Market Fit | Trak | product-owner |
| 5 | Operations | Kit | devops-engineer + site-reliability-engineer |
| 6 | Architecture | Kit | technical-architect |
| 7 | Test Coverage | Kit | qa-test-engineer |

### Supporting Specialists

| Specialist | Used By | Purpose |
|-----------|---------|---------|
| implementation-engineer | Kit | Code writing standards, TDD |
| pr-scope-reviewer | Kit | Pre-audit scope validation |
| data-engineer | Kit | Database/query review |
| business-analyst | Trak | Requirements, ROI analysis |
| orchestrator-coordinator | Trak | Multi-agent coordination patterns |

### How Specialists Work

Specialists are NOT separate processes. They are expertise profiles (stored as markdown files) that the human-facing agents adopt when a task requires deep domain knowledge. Each specialist includes systematic checklists, evidence protocols, and anti-hallucination guardrails.

---

## Agent Specialization Summary

### When to Use Scout
- Customer support inquiries and Zendesk ticket management
- Creating/searching Jira support tickets in MCSP project
- Cross-referencing known bugs with customer issues
- Explaining technical issues in non-technical language
- **Ensemble PR review**: Customer impact assessment + UX/accessibility (dimension #3, ux-ui-designer specialist)

### When to Use Trak
- Sprint planning, status updates, and velocity tracking
- Identifying blockers and stale tickets
- Project-wide issue tracking and organization
- Linking PRs to Jira issues for traceability
- **Ensemble PR review**: Jira verification + product-market fit (dimension #4, product-owner specialist)

### When to Use Kit
- Code review coordination and PR status checks
- CI/CD pipeline monitoring and debugging
- GitHub issue creation and search
- Technical implementation details and code changes
- **Ensemble PR review**: Lead reviewer — 5 dimensions (correctness, security, operations, architecture, test coverage) using 6+ specialist personas

---

## Quick Reference: Agent Identities

Each agent loads its capabilities from:
- **Scout**: `/root/.openclaw/agents/scout/workspace/IDENTITY.md`
- **Trak**: `/root/.openclaw/agents/trak/workspace/IDENTITY.md`
- **Kit**: `/root/.openclaw/agents/kit/workspace/IDENTITY.md`
- **Scribe**: `/root/.openclaw/agents/scribe/workspace/IDENTITY.md`
- **Probe**: `/root/.openclaw/agents/probe/workspace/IDENTITY.md`
- **Beacon**: `/root/.openclaw/agents/beacon/workspace/IDENTITY.md`

The IDENTITY.md file contains:
- Tool availability declarations
- Personality and communication style
- Context about the agent's role and responsibilities
- Specific Jira projects or GitHub orgs the agent focuses on


## Cross-Agent Handoff Routing

Agents use a two-tier delivery system for cross-agent handoffs:

| Priority | Method | How | When |
|----------|--------|-----|------|
| Primary | `sessions_send` | Target: `agent:{name}:main` | Target agent has active session |
| Fallback | #dev @mention | Post to `C086N5031LZ` with `<@USER_ID>` | Target has no active session |
| Blocked | Slack DM | N/A — Slack returns `cannot_dm_bot` | Never use |

**Configuration required:**
- `tools.sessions.visibility` must be `all` in gateway config (set by entrypoint.sh)
- Each IDENTITY.md must have a **Fallback @mention lookup** table with all sibling Slack user IDs
- `config/proactive/handoff-protocol.json` must have `agent_slack_ids` map with all agents

**Agent Slack User IDs (authoritative):**

| Agent | User ID | Session Target |
|-------|---------|----------------|
| Scout | `U0AJLT30KMG` | `agent:scout:main` |
| Trak | `U0AJEGUSELB` | `agent:trak:main` |
| Kit | `U0AKF614URE` | `agent:kit:main` |
| Scribe | `U0AM170694Z` | `agent:scribe:main` |
| Probe | `U0ALRTLF752` | `agent:probe:main` |
| Beacon | `U0AMPKFH5D4` | `agent:beacon:main` |
