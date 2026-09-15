# 堆场闸口集装箱箱号校验（Container Gate Check）

理货员在箱体污损时手工分段抄录集装箱箱号，系统按 ISO 6346 规则实时校验，
避免“外观完整但字符抄错”的错箱被吊装计划放行。

## 组成

| 目录 | 技术栈 | 说明 |
| --- | --- | --- |
| `backend/` | FastAPI + Pydantic | 校验算法、`POST /api/verify`、字段级 422 |
| `frontend/` | React + TypeScript + Vite | 分段录入页面，PASS / FAIL 展示 |
| `docker-compose.yml` | Docker Compose | `web`、`api` 服务与一次性 `verify` 验收服务 |

## 校验规则

录入分为四段：

1. **所有者代码**：3 位，仅允许 `A–Z`；
2. **类别符号**：1 位，仅允许 `U`、`J`、`Z`；
3. **序列号**：6 位数字；
4. **校验位**：1 位数字。

字符映射：数字映射为自身；大写字母依次取 10、12、13、……、38
（即跳过 11 的倍数 11、22、33）。

对前十个字符从左至右分别乘以 2⁰ 至 2⁹，求和后对 11 取模；
余数为 10 时校验位记为 **0**，其余余数即唯一期望校验位。

- 校验通过：页面**只显示 `PASS`**；
- 校验失败：显示 `FAIL`、**实填值**与**唯一期望值**；
- 任一字段非法：立即清除上一次结论，绝不残留绿灯，并在该字段下给出定位提示；
- API 对任何非法字段返回 **422**，错误体 `loc` 给出确定字段位置
  （如 `["body","serial"]`）。

## 快速开始（Docker Compose）

```bash
cp .env.example .env      # 可选，用于覆盖宿主端口
docker compose up --build
```

- 前端页面：http://localhost:8080
- API 健康检查：http://localhost:8000/api/health

### 宿主端口覆盖

通过 `WEB_PORT` 与 `API_PORT` 覆盖（`.env` 文件或环境变量均可）：

```bash
WEB_PORT=9090 API_PORT=9000 docker compose up --build
# 页面 http://localhost:9090 ，API http://localhost:9000
```

### 一次性验收服务 verify

`verify` 是一次性服务：构建后启动真实的 `web` + `api`，
在容器网络内用 Playwright 跑完整端到端联调（页面流程 + 直连 API），
成功退出码为 0，失败非 0。它属于 `acceptance` profile，需显式运行：

```bash
docker compose --profile acceptance run --rm --build verify
```

报告输出到 `playwright-report` 卷。

## 本地开发

### 后端（见 `backend/README.md`）

```bash
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

### 前端（见 `frontend/README.md`）

```bash
cd frontend
npm install
npm run dev          # 开发服务器，/api 代理到 http://localhost:8000
```

## 测试

```bash
# 后端：映射、边界、余数 10->0、422 字段定位、接口联调
cd backend && python -m pytest

# 前端：Vitest 单元/组件测试（映射、边界、结论清除）
cd frontend && npm test

# 端到端：Playwright 真实浏览器联调（需先启动 api 与前端）
cd frontend
npx playwright install chromium
WEB_PORT=5173 npx playwright test          # 针对 Vite dev（5173）
WEB_PORT=8080 npx playwright test          # 针对 compose 暴露端口
```

固定测试向量：

| 编号 | 结果 |
| --- | --- |
| `CSQU3054383` | PASS（真实世界箱号） |
| `CSQU3054388` | FAIL，实填 8，唯一期望 3 |
| `CSQU0000070` | PASS（余数 10 记 0 的边界向量） |
