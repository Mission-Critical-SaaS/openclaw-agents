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
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw
RUN curl -fsSL https://install.openclaw.ai | bash

# Install Node.js (for MCP servers like Jira, GitHub, Stripe)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install MCP server packages globally
RUN npm install -g \
    @anthropic/mcp-server-github \
    @anthropic/mcp-server-jira \
    @anthropic/mcp-server-stripe \
    2>/dev/null || true

# Create directory structure
RUN mkdir -p \
    ${OPENCLAW_HOME}/agents/scout/workspace/skills \
    ${OPENCLAW_HOME}/agents/trak/workspace/skills \
    ${OPENCLAW_HOME}/agents/kit/workspace/skills \
    ${OPENCLAW_HOME}/workspace \
    /data/logs

WORKDIR /root

# Copy configuration
COPY config/ ${OPENCLAW_HOME}/
COPY agents/ /tmp/agents/

# Setup script copies agent configs into place
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
