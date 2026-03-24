FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir aiohttp
COPY proxy.py .
ENV PROXY_PORT=8090
ENV ANTHROPIC_UPSTREAM=https://api.anthropic.com
ENV LOG_FILE=/data/logs/token-usage.jsonl
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8090/health')"
CMD ["python", "proxy.py"]
