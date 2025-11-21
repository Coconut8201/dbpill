# DBPill Docker 部署指南

這個文件說明如何使用 Docker 和 Docker Compose 來架設 DBPill 專案。

## 前置需求

- Docker
- Docker Compose
- 一個可連線的 PostgreSQL 資料庫（可以是本機或遠端）

## 快速開始

### 1. 設定環境變數

複製環境變數範例檔案：

```bash
cp .env.docker.example .env
```

編輯 `.env` 檔案，填入你的 PostgreSQL 資料庫連線資訊：

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=host.docker.internal  # 本機資料庫使用這個
POSTGRES_PORT=5432
POSTGRES_DB=your_database
```

**注意：** 如果你的 PostgreSQL 資料庫運行在本機（非 Docker），請使用 `host.docker.internal` 作為主機名稱。

### 2. 建置並啟動服務

```bash
docker-compose up -d --build
```

### 3. 查看日誌

```bash
docker-compose logs -f dbpill
```

### 4. 訪問服務

- **Web UI**: http://localhost:3000
- **SQL Proxy**: localhost:5433

## 使用方式

1. 將你的應用程式的資料庫連線字串改為連接到 DBPill 的 SQL Proxy：
   ```
   postgresql://user:password@localhost:5433/database
   ```

2. 開啟瀏覽器訪問 http://localhost:3000 查看攔截到的 SQL 查詢

## 常用命令

### 啟動服務
```bash
docker-compose up -d
```

### 停止服務
```bash
docker-compose down
```

### 重新建置
```bash
docker-compose up -d --build
```

### 查看日誌
```bash
docker-compose logs -f dbpill
```

### 進入容器
```bash
docker-compose exec dbpill sh
```

### 清除所有資料（包含查詢歷史）
```bash
docker-compose down -v
```

## 連接到不同的資料庫

### 本機 PostgreSQL
```env
POSTGRES_HOST=host.docker.internal
```

### Docker 網路中的 PostgreSQL
如果你的 PostgreSQL 也在 Docker 中運行（但不在這個 compose 檔案中），使用容器名稱或服務名稱：
```env
POSTGRES_HOST=postgres_container_name
```

### 遠端 PostgreSQL
直接使用 IP 或域名：
```env
POSTGRES_HOST=192.168.1.100
# 或
POSTGRES_HOST=db.example.com
```

## 開發模式

如果你想在開發時即時更新程式碼，可以取消 `docker-compose.yml` 中的卷掛載註解：

```yaml
volumes:
  - dbpill-data:/app/data
  - ./server:/app/server      # 取消註解
  - ./shared:/app/shared      # 取消註解
  - ./client:/app/client      # 取消註解
```

然後重新啟動服務：
```bash
docker-compose restart dbpill
```

## 疑難排解

### 無法連接到本機資料庫
確保使用 `host.docker.internal` 作為主機名稱，並且你的 PostgreSQL 允許來自 Docker 網路的連線。

### 埠已被佔用
如果 3000 或 5433 埠已被使用，可以在 `docker-compose.yml` 中修改埠映射：
```yaml
ports:
  - "3001:3000"  # 將 Web UI 映射到 3001
  - "5434:5433"  # 將 SQL Proxy 映射到 5434
```

### 查看詳細錯誤
```bash
docker-compose logs -f dbpill
```

## 架構說明

- **Web UI (3000)**: 提供查詢管理介面
- **SQL Proxy (5433)**: PostgreSQL 代理伺服器，攔截並記錄所有 SQL 查詢
- **SQLite 資料庫**: 儲存查詢歷史（持久化在 Docker volume 中）

## 注意事項

1. 這個配置**不包含** PostgreSQL 資料庫，你需要連接到現有的資料庫
2. 查詢歷史儲存在 Docker volume `dbpill-data` 中
3. 預設使用開發模式，適合測試和開發使用
