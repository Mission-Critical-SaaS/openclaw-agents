# OpenClaw Gateway - Multi-Agent Docker Image
FROM ubuntu:22.04 AS base

ARG OPENCLAW_VERSION=2026.3
ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive
ENV OPENCLAW_HOME=/home/openclaw/.openclaw

RUN apt-get update && apt-get install -y curl jq ca-certificates awscli gettext-base git logrotate && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash -u 1000 openclaw

# Logrotate config for OpenClaw gateway logs (prevents disk fill)
RUN printf '/data/logs/*.log {\n  daily\n  rotate 7\n  compress\n  missingok\n  notifempty\n  copytruncate\n  size 50M\n  maxage 30\n}\n/opt/openclaw/logs/*.log {\n  daily\n  rotate 14\n  compress\n  missingok\n  notifempty\n  copytruncate\n  size 100M\n  maxage 60\n}\n' > /etc/logrotate.d/openclaw

# Install Node.js 22 (required for OpenClaw and MCP servers)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Install OpenClaw via npm (full channel bridge support: Slack, Discord, etc.)
# Pin to major version to get patches but avoid breaking changes
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Install MCP server packages globally
RUN npm install -g @anthropic/mcp-server-github @aashari/mcp-server-atlassian-jira @anthropic/mcp-server-stripe @notionhq/notion-mcp-server zd-mcp-server 2>/dev/null || true
RUN npm install -g @macnishio/zoho-mcp-server 2>/dev/null || true

# Create directory structure
RUN mkdir -p ${OPENCLAW_HOME}/agents/scout/workspace/skills ${OPENCLAW_HOME}/agents/trak/workspace/skills ${OPENCLAW_HOME}/agents/kit/workspace/skills ${OPENCLAW_HOME}/agents/scribe/workspace/skills ${OPENCLAW_HOME}/workspace /data/logs

WORKDIR /home/openclaw

COPY config/ ${OPENCLAW_HOME}/
COPY scripts/ /app/scripts/
COPY agents/ /tmp/agents/
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/configure_channels.py /configure_channels.py
RUN chmod +x /entrypoint.sh /app/scripts/*.sh 2>/dev/null || true
RUN chown -R openclaw:openclaw /home/openclaw /data/logs /tmp/agents

USER openclaw

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
