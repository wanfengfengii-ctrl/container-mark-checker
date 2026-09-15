# Frontend — Container Gate Check Web

React + TypeScript + Vite 页面。理货员分段录入箱号，
提交后只显示 `PASS`，或显示 `FAIL`、实填校验位与唯一期望校验位；
任一字段非法立即清除旧结论（防止残留绿灯放行错箱）。
`FAIL` 后可发起「定位疑似抄错」，点选后端返回的最低成本候选回填四段。

## 运行

```bash
npm install
npm run dev
```

开发服务器 http://localhost:5173 会把 `/api/*` 代理到
`http://localhost:8000`（可用 `VITE_API_PROXY_TARGET` 覆盖）。

生产构建：

```bash
npm run build     # tsc 类型检查 + vite build，产物在 dist/
npm run preview
```

## 测试

```bash
npm test                       # Vitest：映射、边界、组件交互
npx playwright install chromium
WEB_PORT=5173 npx playwright test   # Playwright 真实浏览器端到端联调
```

- `src/validation.ts`：与后端一致的 ISO 6346 映射及前端字段校验；
- `src/api.ts`：调用 `/api/verify` 与 `/api/corrections`，并解析 422 的字段级 `loc`；
- `src/App.tsx`：表单、结论与 FAIL 后的诊断流程，任何输入变更都会清空旧结论与诊断；
- `e2e/`：页面流程测试与直连 API 测试（含单次易混替换、两步并列、无解、回填复核）。
