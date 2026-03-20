# app_project_small API 接口文档

本文档详细说明了 `app_project_small` 框架提供的 REST API 接口。

## 接口前缀

| 模块 | URL 前缀 | 说明 |
| :--- | :--- | :--- |
| 认证接口 | `/api/auth` | 登录、Token 管理 |
| 测试接口 | `/api/test` | CRUD、缓存、文件等功能样例 |
| 异步接口 | `/api/async` | 异步视图示例 |
| 健康检查 | 无前缀 | 服务状态检测 |

## 认证方式

所有标注 **需要认证** 的接口均需使用 JWT (JSON Web Tokens) 进行认证。
请在请求头 `Authorization` 中携带 Token：

```
Authorization: Bearer <your_access_token>
```

---

## 1. 认证接口 (Authentication)

### 用户登录
**接口:** `POST /api/auth/login`

**说明:** 验证用户名密码并获取访问令牌 (Access Token)。

**请求体:** `application/json`
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "..."
  }
}
```

---

## 2. 健康检查 (Health Check)

### 服务存活检查
**接口:** `GET /health`

**说明:** 检查服务是否存活。

**响应:** `200 OK`
```json
{
  "status": "healthy"
}
```

### 服务就绪检查
**接口:** `GET /ready`

**说明:** 检查依赖服务（MySQL, Redis）是否就绪。

**响应:** `200 OK` / `503 Service Unavailable`
```json
{
  "status": "ready",
  "checks": {
    "mysql": true,
    "redis": true
  }
}
```

---

## 3. 测试接口 - 用户管理 (User Management)

### 查询用户
**接口:** `GET /api/test`

**说明:** 根据工号查询用户记录。

**Query 参数:**
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `work_no` | string | 否 | 工号（不传则查询全部） |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "work_no": "1001",
    "username": "test_user",
    "status": 1,
    "created_at": "2023-12-01 12:00:00"
  }
}
```

### 创建用户
**接口:** `POST /api/test` **需要认证**

**说明:** 创建新用户记录。

**请求体:** `application/json`
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `work_no` | string | 是 | 工号 (唯一) |
| `username` | string | 否 | 用户名 |
| `password` | string | 否 | 密码 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "创建成功",
  "content": { ... }
}
```

### 更新用户
**接口:** `PUT /api/test` **需要认证**

**说明:** 更新现有用户记录。

**请求体:** `application/json`
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `work_no` | string | 是 | 要更新的工号 |
| `username` | string | 否 | 新用户名 |
| `password` | string | 否 | 新密码 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "更新成功"
}
```

### 删除用户
**接口:** `DELETE /api/test` **需要认证**

**说明:** 删除用户记录。

**请求体:** `application/json`
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `work_no` | string | 是 | 要删除的工号 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "删除成功"
}
```

### 分页查询列表
**接口:** `GET /api/test/list`

**说明:** 分页获取用户列表。

**Query 参数:**
| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | integer | 1 | 页码 |
| `page_size` | integer | 20 | 每页条数 (最大 100) |
| `work_no` | string | - | 按工号筛选 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "list": [ ... ],
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

---

## 4. 缓存与 Redis 操作 (Cache & Redis)

### 获取缓存
**接口:** `GET /api/test/cache`

**Query 参数:**
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | 是 | 缓存键名 |
| `type` | string | 否 | 类型：`string`, `hash`, `list`。默认 `string` |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "key": "my_key",
    "type": "string",
    "value": "cached_value"
  }
}
```

### 设置缓存
**接口:** `POST /api/test/cache` **需要认证**

**请求体:** `application/json`
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | 是 | 缓存键名 |
| `value` | any | 是 | 缓存值 |
| `type` | string | 否 | 类型 (`string`, `hash`, `list`)，默认 `string` |
| `ttl` | integer | 否 | 过期时间（秒） |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "缓存设置成功"
}
```

### 删除缓存
**接口:** `DELETE /api/test/cache` **需要认证**

**Query 参数:**
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | 是 | 缓存键名 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "缓存删除成功"
}
```

### Redis 计数器
**接口:** `GET /api/test/redis/counter`

**说明:** 获取计数器当前值。

**Query 参数:**
| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | `counter:default` | 计数器键名 |

---

**接口:** `POST /api/test/redis/counter` **需要认证**

**说明:** 操作计数器（原子操作 INCR/DECR）。

**请求体:** `application/json`
| 字段 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | `counter:default` | 计数器键名 |
| `action` | string | `incr` | 操作类型：`incr`, `decr`, `set`, `reset` |
| `amount` | integer | 1 | 增减数量 |
| `ttl` | integer | - | 过期时间（秒） |

---

### Redis 集合 (Set)
**接口:** `GET /api/test/redis/set`

**说明:** 获取集合所有成员。

**Query 参数:**
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | 是 | 集合键名 |

---

**接口:** `POST /api/test/redis/set` **需要认证**

**说明:** 添加集合成员。

**请求体:** `application/json`
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `key` | string | 集合键名 |
| `members` | array | 成员列表 |

---

**接口:** `DELETE /api/test/redis/set` **需要认证**

**说明:** 删除集合成员。

**请求体:** `application/json`
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `key` | string | 集合键名 |
| `members` | array | 要删除的成员列表 |

---

### Redis 有序集合 (Sorted Set)
**接口:** `GET /api/test/redis/zset`

**说明:** 获取排行榜数据（带分数排名）。

**Query 参数:**
| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | string | - | 有序集合键名（必填） |
| `start` | integer | 0 | 起始位置 |
| `end` | integer | 9 | 结束位置（前10名） |
| `withscores` | boolean | true | 是否返回分数 |

---

**接口:** `POST /api/test/redis/zset` **需要认证**

**说明:** 添加/更新排行榜数据。

**请求体:** `application/json`
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `key` | string | 有序集合键名 |
| `members` | object | 成员分数字典，如 `{"user1": 100, "user2": 200}` |

---

### Redis 批量操作
**接口:** `GET /api/test/redis/batch`

**说明:** 批量获取数据 (MGET)。

**Query 参数:**
| 参数名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `keys` | string | 键名列表，逗号分隔 |

---

**接口:** `POST /api/test/redis/batch` **需要认证**

**说明:** 批量设置数据 (MSET)。

**请求体:** `application/json`
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `data` | object | 键值对字典，如 `{"key1": "value1", "key2": "value2"}` |

---

**接口:** `DELETE /api/test/redis/batch` **需要认证**

**说明:** 按模式批量删除键。

**Query 参数:**
| 参数名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `pattern` | string | 键名模式，如 `cache:*`（不允许使用 `*`） |

---

### 缓存装饰器测试
**接口:** `GET /api/test/cache/decorator`

**说明:** 测试 `@cache_result` 装饰器的缓存自动处理功能。

**Query 参数:**
| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `param` | string | `default` | 测试参数 |
| `type` | string | `basic` | 测试类型：`basic`, `user_info` |

---

## 5. 文件操作 (MinIO/S3)

### 获取文件下载链接
**接口:** `GET /api/test/file` **需要认证**

**Query 参数:**
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `bucket_name` | string | 是 | 存储桶名称 |
| `file_path` | string | 是 | 文件路径 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "url": "https://..."
  }
}
```

### 上传文件
**接口:** `POST /api/test/file` **需要认证**

**表单参数 (Form Data):**
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `bucket_name` | string | 是 | 存储桶名称 |
| `file_path` | string | 是 | 存储路径 |
| `file` | file | 是 | 要上传的文件对象 |

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "文件上传成功"
}
```

---

## 6. 系统信息 (System Info)

### 用户画像
**接口:** `GET /api/test/profile` **需要认证**

**说明:** 获取当前登录用户信息（基于 Token 解析）。

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "username": "test_user",
    "work_no": "1001"
  }
}
```

### 公共配置
**接口:** `GET /api/test/config`

**说明:** 获取系统公开配置信息（非敏感）。

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "api_version": "v1",
    "page_size_default": 20,
    "page_size_max": 100
  }
}
```

---

## 7. 异步接口示例 (Async)

### 异步测试
**接口:** `GET /api/async`

**说明:** Flask 异步视图函数示例。生产环境请使用支持 ASGI 的服务器（如 Hypercorn/UVicorn）。

**响应:** `200 OK`
```json
{
  "code": "S10000",
  "msg": "OK",
  "content": {
    "msg": "async ok"
  }
}
```

---

## 8. 错误响应格式

所有接口在发生错误时，返回统一的错误响应格式：

```json
{
  "code": "F10002",
  "msg": "错误描述信息",
  "content": {
    "field": "错误相关字段或详情"
  }
}
```

### 状态码规范

格式：`[S/F][类别][序号]`，`S` 表示成功，`F` 表示失败。

#### 通用 (10xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `S10000` | 请求成功 | 200 |
| `F10001` | 请求失败（通用错误） | 500 |
| `F10002` | 参数验证失败 | 400 |
| `F10003` | 请求格式错误 | 400 |
| `F10004` | 请求超时 | 408 |
| `F10005` | 服务器内部错误 | 500 |

#### 用户/认证 (20xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F20001` | 用户未登录 | 401 |
| `F20002` | Token 无效或已过期 | 401 |
| `F20003` | 用户名或密码错误 | 401 |
| `F20004` | 账号已被禁用 | 401 |
| `F20005` | 账号已被锁定 | 401 |
| `F20006` | Token 刷新失败 | 401 |

#### 权限 (30xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F30001` | 权限不足 | 403 |
| `F30002` | 无权访问该资源 | 403 |
| `F30003` | 操作被拒绝 | 403 |
| `F30004` | IP 访问受限 | 403 |

#### 资源 (40xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F40001` | 资源不存在 | 404 |
| `F40002` | 资源已存在 | 400 |
| `F40003` | 资源已被删除 | 404 |
| `F40004` | 资源被锁定 | 400 |

#### 业务逻辑 (50xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F50001` | 业务处理失败 | 400 |
| `F50002` | 数据状态异常 | 400 |
| `F50003` | 操作条件不满足 | 400 |
| `F50004` | 并发冲突 | 400 |

#### 外部服务 (60xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F60001` | 外部服务调用失败 | 502 |
| `F60002` | 外部服务超时 | 502 |
| `F60003` | 外部服务不可用 | 502 |

#### 数据 (70xxx)

| 状态码 | 说明 | HTTP 状态码 |
| :--- | :--- | :--- |
| `F70001` | 数据库操作失败 | 500 |
| `F70002` | 缓存操作失败 | 500 |
| `F70003` | 数据格式错误 | 400 |

### 异常类与状态码对应

| 异常类 | 默认状态码 | 说明 |
| :--- | :--- | :--- |
| `ValidationException` | F10002 | 参数格式/字段校验失败 |
| `AuthenticationException` | F20001 | 未登录或 Token 无效 |
| `PermissionException` | F30001 | 用户权限不足 |
| `ResourceNotFoundException` | F40001 | 资源不存在 |
| `ResourceExistsException` | F40002 | 资源重复创建 |
| `BusinessException` | F50001 | 违反业务规则 |
| `ExternalServiceException` | F60001 | 外部服务调用失败 |
| `DatabaseException` | F70001 | 数据库操作失败 |
| `CacheException` | F70002 | Redis 等缓存操作失败 |
