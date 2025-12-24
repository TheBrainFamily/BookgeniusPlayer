FROM oven/bun:1.1-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY index.ts .
COPY package.json .

# No EXPOSE - this is not an HTTP server, it's a run-to-completion job
CMD ["bun", "run", "index.ts"]
