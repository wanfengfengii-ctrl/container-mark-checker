# Backend — Container Gate Check API

FastAPI + Pydantic 实现的 ISO 6346 箱号校验服务。

## 运行

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `GET /api/health` → `{"status":"ok"}`
- `POST /api/verify`

```bash
curl -X POST http://localhost:8000/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"owner_code":"CSQ","category":"U","serial":"305438","check_digit":"3"}'
```

合法请求返回：

```json
{
  "valid": true,
  "expected_check_digit": "3",
  "actual_check_digit": "3",
  "container_number": "CSQU3054383"
}
```

任一字段非法返回 **422**，每条错误的 `loc` 末位为确定字段名：
`owner_code` / `category` / `serial` / `check_digit`。

## 测试

```bash
pip install -r requirements-dev.txt
python -m pytest
```

覆盖：字母映射边界（10/12、跳过 22 与 33、Z=38）、数字自映射、
权重 2⁰…2⁹、余数 10 记 0、全 9 极值、接口 200/422 与字段定位。

## 目录

```
app/
  validation.py   # ISO 6346 映射与校验位计算（无框架依赖）
  schemas.py      # Pydantic 严格输入模型
  main.py         # FastAPI 路由
tests/            # pytest
```
