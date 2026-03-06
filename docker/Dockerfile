# ──────────────────────────────────────────────────────────
# OpenClaw Gateway — Multi-Agent Docker Image
# ──────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS base

ARG OPENCLAW_VERSION=latest
ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive
ENV OPENCLAW_HOME=/root/.openclaw

RUN apt-get update && apt-get install -y \
    curl \
    jq \
    git \
    ca-certificates \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (required for OpenClaw + MCP servers)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw via npm (curl installer doesn't work reliably in Docker)
RUN npm install -g openclaw@latest \
    && which openclaw \
    && openclaw --version

# Install mcporter (MCP server manager, bundled with OpenClaw)
# Verify it's available
RUN which mcporter || npm install -g mcporter 2>/dev/null || true

# Install MCP server packages globally (for mcporter stdio transport)
RUN npm install -g \
    @aashari/mcp-server-atlassian-jira \
    zd-mcp-server \
    2>/dev/null || true

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Create directory structure
RUN mkdir -p \
    ${OPENCLAW_HOME}/agents/scout/workspace \
    ${OPENCLAW_HOME}/agents/scout/agent \
    ${OPENCLAW_HOME}/agents/trak/workspace \
    ${OPENCLAW_HOME}/agents/trak/agent \
    ${OPENCLAW_HOME}/agents/kit/workspace \
    ${OPENCLAW_HOME}/agents/kit/agent \
    ${OPENCLAW_HOME}/workspace \
    /data/logs

WORKDIR /root

# Copy configuration template
COPY config/ ${OPENCLAW_HOME}/

# Copy agent workspace files (IDENTITY.md etc.)
COPY agents/ /tmp/agents/

# Setup script copies agent configs into place
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# No inbound ports needed — Slack Socket Mode is outbound only
ENTRYPOINT ["/entrypoint.sh"]
