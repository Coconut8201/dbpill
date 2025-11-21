# 建置階段
FROM node:25-trixie AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:25-trixie

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY --from=builder /app/dist ./dist

COPY run.ts ./
COPY server ./server
COPY shared ./shared
COPY client ./client
COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.node.json vite-env.d.ts ./

# 複製 TLS 憑證（SQL Proxy 需要）
COPY credentials ./credentials

# 建立 SQLite 資料庫目錄
RUN mkdir -p /app/data

EXPOSE 3000 5433

ENV NODE_ENV=development

CMD ["sh", "-c", "npx tsx run.ts --mode development --port 3000 --web-port 3000 --proxy-port 5433 \"${DATABASE_URL}\""]