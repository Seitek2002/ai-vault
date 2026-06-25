# AI Vault — система деловых документов

Монорепо с npm workspaces + Turborepo.

```
apps/web       — Next.js 16 фронтенд  http://localhost:3000
apps/api       — NestJS бэкенд        http://localhost:3001/api
packages/types — общие TypeScript типы
```

## Быстрый старт

### 1. Предварительные требования
- Node.js ≥ 20.9
- Docker Desktop

### 2. Установить зависимости
```bash
npm install
```

### 3. Запустить инфраструктуру (PostgreSQL + MinIO)
```bash
docker compose up -d
```

### 4. Настроить переменные окружения API
```bash
cp apps/api/.env.example apps/api/.env
# Отредактируй apps/api/.env при необходимости
```

### 5. Применить миграции Prisma
```bash
npm run db:migrate --workspace=@ai-vault/api
```

### 6. Запустить всё одной командой
```bash
npm run dev
```

Или по отдельности:
```bash
npm run dev --workspace=@ai-vault/web   # фронтенд :3000
npm run dev --workspace=@ai-vault/api   # бэкенд   :3001
```

## MinIO (S3-совместимое хранилище)
Консоль: http://localhost:9001  
Логин: `minioadmin` / `minioadmin`  
Создай бакет `ai-vault` в консоли.

## Prisma Studio
```bash
npm run db:studio --workspace=@ai-vault/api
```
