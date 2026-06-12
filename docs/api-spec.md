# API 接口规范

## 状态

> **状态：** 草稿  
> **作者：** Architect Agent  
> **最后更新：** —

---

## Base URL

```
开发环境：  http://localhost:8000/api/v1
生产环境：  https://api.yourdomain.com/v1
```

---

## 身份认证

所有受保护的接口需携带：

```
Authorization: Bearer <token>
```

---

## 接口列表

### 认证模块

#### POST /auth/register

注册新用户。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**响应 201：**
```json
{
  "id": "string",
  "email": "user@example.com",
  "token": "string"
}
```

---

#### POST /auth/login

用户登录。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**响应 200：**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "email": "user@example.com"
  }
}
```

---

### [资源模块]

#### GET /resource

_接口描述_

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| limit | int | 否 | 每页数量，默认 20 |

**响应 200：**
```json
{
  "data": [],
  "total": 0,
  "page": 1
}
```

---

## 错误响应

| 状态码 | Code | 说明 |
|--------|------|------|
| 400 | BAD_REQUEST | 请求参数无效 |
| 401 | UNAUTHORIZED | Token 缺失或无效 |
| 403 | FORBIDDEN | 权限不足 |
| 404 | NOT_FOUND | 资源不存在 |
| 429 | RATE_LIMITED | 请求频率超限 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

**错误响应体：**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "可读的错误说明"
  }
}
```

---

## 限流规则

| 用户类型 | 限制次数 | 时间窗口 |
|---------|---------|---------|
| 免费用户 | — | 每天 |
| 付费用户 | — | 每天 |
