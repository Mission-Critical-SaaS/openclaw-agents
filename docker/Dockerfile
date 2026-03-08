# OpenClaw Gateway - Multi-Agent Docker Image
FROM ubuntu:22.04 AS base

ARG OPENCLAW_VERSION=latest
ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive
ENV OPENCLAW_HOME=/root/.openclaw

RUN apt-get update && apt-get install -y curl jq ca-certificates awscli gettext-base git && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (required for OpenClaw and MCP servers)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Install OpenClaw via npm (full channel bridge support: Slack, Discord, etc.)
RUN npm install -g openclaw@latest

# Install MCP server packages globally
RUN npm install -g @anthropic/mcp-server-github @aashari/mcp-server-atlassian-jira @anthropic/mcp-server-stripe @notionhq/notion-mcp-server zd-mcp-server 2>/dev/null || true

# Create directory structure
RUN mkdir -p ${OPENCLAW_HOME}/agents/scout/workspace/skills ${OPENCLAW_HOME}/agents/trak/workspace/skills ${OPENCLAW_HOME}/agents/kit/workspace/skills ${OPENCLAW_HOME}/workspace /data/logs

WORKDIR /root

COPY config/ ${OPENCLAW_HOME}/
COPY agents/ /tmp/agents/
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/configure_channels.py /configure_channels.py
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
