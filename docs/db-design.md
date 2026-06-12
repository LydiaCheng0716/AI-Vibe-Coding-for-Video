# 数据库设计

## 状态

> **状态：** 草稿  
> **作者：** Architect Agent  
> **最后更新：** —

---

## 数据库信息

| 属性 | 值 |
|------|-----|
| 引擎 | — |
| 版本 | — |
| ORM | — |

---

## 实体关系概览

```
[users] ──< [sessions]
   │
   └──< [resource]
```

---

## 数据表

### users（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, NOT NULL | 主键 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 用户邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | 加密密码 |
| plan | ENUM | NOT NULL, DEFAULT 'free' | free / paid |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL | 更新时间 |

**索引：**
- `idx_users_email` on `email`

---

### sessions（会话表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, NOT NULL | 主键 |
| user_id | UUID | FK → users.id | 关联用户 |
| token_hash | VARCHAR(255) | NOT NULL | Token 哈希值 |
| expires_at | TIMESTAMP | NOT NULL | 过期时间 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |

**索引：**
- `idx_sessions_user_id` on `user_id`
- `idx_sessions_token_hash` on `token_hash`

---

## 迁移策略

- 所有 Schema 变更通过 migration 文件管理
- migration 文件合并后禁止修改
- 命名规则：`YYYYMMDD_HHMMSS_description.sql`

---

## 初始数据（Seed Data）

_描述开发/预发布环境所需的初始数据_
