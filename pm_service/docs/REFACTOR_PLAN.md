# 后端代码风格改造计划

> 目标：将现有后端代码逐步对齐 `app_project_small` 框架规范
> 创建时间：2026-06-10
> 原则：渐进式改造，每个阶段可独立上线，不影响现有功能

---

## 现状分析

| 维度 | 规范要求 | 当前项目 |
|------|---------|---------|
| Table 层 | `tables/` 目录，每张表一个文件，类名 `XxxTable` | `dbs/mysql_db/model_tables.py` 一个文件放所有表，类名 `XxxModel` |
| DAO 层 | `daos/` 目录，封装 CRUD，返回 Table 实例 | 无 DAO 层，Controller 直接操作 `db.session` |
| Serialize 层 | `serializes/xxx_schema.py` 做请求校验，`xxx_serializer.py` 做序列化 | 有 Schema 文件但大部分未使用，View 直接 `request.get_json()` |
| 软删除 | `deleted_at` 时间戳 | `status = 1/0` 整数字段 |
| 响应格式 | `{"code": "S10000", "msg": "OK", "content": ...}` | `{"code": 0, "msg": "success", "data": ...}` |

---

## 阶段一：基础设施调整

> 风险：低 | 不影响业务逻辑 | 可独立上线

### 1.1 创建 `tables/` 目录，拆分 Model

将 `dbs/mysql_db/model_tables.py` 中的每张表拆分为独立文件：

```
tables/
├── __init__.py              # 统一导出所有 Table
├── base_table.py            # BaseMixinModel 基类
├── user_table.py            # UserProfileModel, AdminUserModel, DepartmentModel, RoleModel, UserRoleModel, HierarchyModel
├── project_table.py         # ProjectDataModel, ProjectFileModel, ProjectGroupModel
├── requirement_table.py     # RequirementModel, StandaloneReqModel
├── function_table.py        # FunctionDataModel, ProgressRecordDataModel
├── duty_table.py            # TemporaryDutyModel, DutyProgressRecordModel
├── milestone_table.py       # MilestoneModel
├── review_table.py          # ReviewApplyModel
├── daily_log_table.py       # DailyLogModel
├── system_table.py          # SystemModel, SystemConfigModel
├── notification_table.py    # NotificationModel
├── dashboard_table.py       # UserDashboardConfigModel
├── meeting_note_table.py    # MeetingNoteModel
└── operation_log_table.py   # OperationLogModel
```

- 原 `model_tables.py` 保留为兼容层，`from tables.xxx_table import *` 全部重新导出
- 现有 `from dbs.mysql_db.model_tables import Xxx` 不受影响

### 1.2 统一文件头注释

所有 `.py` 文件补充标准头：

```python
# -*- coding: utf-8 -*-
"""
@文件: xxx.py
@说明: xxx
"""
```

### 1.3 清理 `dbs/mysql_db/__init__.py`

- 移除未使用的导出（`CommonModelDbSchema`、`DBFunction`、`MySQLDBManager` 等）
- 只保留实际使用的 `db`

---

## 阶段二：DAO 层引入

> 风险：中 | 逐模块推进 | 每个模块改完可独立上线

### 2.1 创建 DAO 基础

```
daos/
├── __init__.py
└── base_dao.py              # 封装通用 CRUD、分页、软删除查询
```

### 2.2 按模块逐个抽取 DAO

从简单模块开始，逐步向复杂模块推进：

| 顺序 | 模块 | DAO 文件 | 涉及 Controller | 复杂度 |
|------|------|---------|----------------|--------|
| 1 | 系统管理 | `daos/system_dao.py` | `system_controller.py` | 低 |
| 2 | 通知 | `daos/notification_dao.py` | `notification_controller.py` | 低 |
| 3 | 会议备注 | `daos/meeting_note_dao.py` | `meeting_note_controller.py` | 低 |
| 4 | 仪表盘配置 | `daos/dashboard_config_dao.py` | `dashboard_config_controller.py` | 低 |
| 5 | 用户 | `daos/user_dao.py` | `user_controller.py` | 中 |
| 6 | 需求 | `daos/requirement_dao.py` | `requirement_controller.py` | 中 |
| 7 | 系统需求 | `daos/standalone_req_dao.py` | `standalone_req_controller.py` | 中 |
| 8 | AR/任务 | `daos/duty_dao.py` | `duty_controller.py` | 高 |
| 9 | 专案 | `daos/project_dao.py` | `project_controller.py` | 高 |
| 10 | 统计 | `daos/statistics_dao.py` | `statistics_controller.py` | 高 |

### 每个 DAO 的改造步骤

1. 从 Controller 中提取所有 `db.session.query(...)` 操作
2. 封装为 DAO 方法（返回 Table 实例或字典）
3. Controller 改为调用 DAO 方法
4. 运行测试验证

---

## 阶段三：Serialize 层启用

> 风险：中 | 渐进式 | 逐接口启用

### 3.1 补充请求校验 Schema

更新现有 `serializes/` 下的文件，确保字段与前端传参一致。优先启用高频接口：

| 文件 | 接口 |
|------|------|
| `user_schema.py` | 登录、创建用户（已部分启用） |
| `project_schema.py` | 创建/更新专案 |
| `duty_schema.py` | 创建/更新 AR |
| `daily_log_schema.py` | 创建/更新日志 |
| `requirement_schema.py` | 创建/更新需求 |

### 3.2 View 层改造

- 将 `request.get_json()` 替换为 `@blp.arguments(XxxSchema)`
- 每次只改一个 View 文件，改完测试

### 3.3 补充 Serializer（ORM -> Dict）

- 创建 `serializes/xxx_serializer.py`
- 将各 Table 的 `to_dict()` 方法迁移到 Serializer
- Controller 通过 Serializer 做响应序列化

---

## 阶段四：命名规范统一（可选）

> 风险：高 | 全局替换 | 需一次性完成

### 4.1 类名重命名

- `XxxModel` -> `XxxTable`（如 `UserProfileModel` -> `UserProfileTable`）
- 涉及所有 controller、view、test 文件
- 建议用脚本批量替换 + 在 `model_tables.py` 保留别名兼容

### 4.2 表名统一

- 当前表名如 `project_data_form`、`function_data_form`
- 规范建议更简洁如 `projects`、`functions`
- **建议不改**（改数据库表名风险极高，需要数据迁移）

---

## 阶段五：其他规范对齐

> 风险：低 | 零散改动

### 5.1 日志规范

- 检查是否有 `print()` 残留，替换为 `logger`
- 统一结构化日志格式

### 5.2 响应格式

- 当前：`{"code": 0, "msg": "success", "data": ...}`
- 规范：`{"code": "S10000", "msg": "OK", "content": ...}`
- **建议保持现有格式**，前端已全面适配

### 5.3 软删除方式

- 当前：`status = 1/0` 整数字段
- 规范：`deleted_at` 时间戳
- **建议不改**（数据库已有大量数据，迁移成本高）

---

## 风险与工作量评估

| 阶段 | 新增文件数 | 修改文件数 | 风险 | 可独立上线 |
|------|----------|----------|------|----------|
| 阶段一：拆分 Table | ~15 | ~2 | 低 | 是 |
| 阶段二：DAO 层 | ~12 | ~10 | 中 | 是（逐模块） |
| 阶段三：Serialize | ~8 | ~8 | 中 | 是（逐接口） |
| 阶段四：重命名 | 0 | ~30+ | 高 | 需一次性 |
| 阶段五：其他 | 0 | 零散 | 低 | 是 |

---

## 建议执行顺序

```
阶段一（拆分 Table + 文件头 + 清理导出）
  ↓
阶段二：前4个简单 DAO（system / notification / meeting_note / dashboard）
  ↓ 上线验证
阶段二：中等 DAO（user / requirement / standalone_req）
  ↓ 上线验证
阶段二：复杂 DAO（duty / project / statistics）
  ↓ 上线验证
阶段三（渐进启用 Schema 校验）
  ↓
阶段五（日志等零散项）
  ↓
阶段四（可选，视团队意愿决定是否执行）
```

---

## 不建议改动的部分

| 项目 | 原因 |
|------|------|
| 数据库表名（`xxx_form`） | 已有生产数据，改名需要数据迁移 |
| 软删除方式（`status` 字段） | 已深度使用，改 `deleted_at` 影响所有查询 |
| 响应格式（`code: 0`） | 前端已全面适配，改动需前后端同步 |
| MongoDB 日志存储方式 | 运行稳定，无需改动 |
