FROM oven/bun:1.3.13-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

EXPOSE 5000

CMD ["bun", "run", "start"]
