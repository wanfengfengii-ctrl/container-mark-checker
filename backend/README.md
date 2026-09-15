# Backend — Container Gate Check API

FastAPI + Pydantic 实现的 ISO 6346 箱号校验服务。

## 运行

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `GET /api/health` → `{"status":"ok"}`
- `POST /api/verify`
- `POST /api/corrections`（FAIL 后定位疑似抄错，请求模型与 `/api/verify` 相同）

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

`POST /api/corrections` 在编号格式合法但校验失败时，返回预算内
（总成本 ≤ 2）全局最低成本的全部候选：

```bash
curl -X POST http://localhost:8000/api/corrections \
  -H 'Content-Type: application/json' \
  -d '{"owner_code":"KEM","category":"Z","serial":"058631","check_digit":"8"}'
# {"minimum_cost":1,"candidates":["KEMZ0506318"]}
```

- 字段非法：**422**（字段级 `loc`，同 `/api/verify`）；
- 原编号已通过校验：**409**；
- 预算内无解：**200** `{"minimum_cost":null,"candidates":[]}`。

只改前十位、保持实填校验位；原字段内替换或字段内相邻交换，
`I/L`、`O/Q`、`C/G` 与 `0/6/8/9` 组内替换及相邻交换成本 1，
其他合法替换成本 3，候选按完整箱号字典序返回。

## 测试

```bash
pip install -r requirements-dev.txt
python -m pytest
```

覆盖：字母映射边界（10/12、跳过 22 与 33、Z=38）、数字自映射、
权重 2⁰…2⁹、余数 10 记 0、全 9 极值、接口 200/409/422 与字段定位、
校正的单次易混替换、两步并列、无解空列表与候选回填复核。

## 目录

```
app/
  validation.py   # ISO 6346 映射与校验位计算（无框架依赖）
  corrections.py  # 疑似抄错的有界最短路径搜索（无框架依赖）
  schemas.py      # Pydantic 严格输入模型、校正响应模型
  main.py         # FastAPI 路由 /api/verify 与 /api/corrections
tests/            # pytest
```
