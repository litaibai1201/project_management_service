# 专案管理系统 API 文档

> 生成时间：2026-06-10
> 服务根路径：`http://<host>:<port>`

---

## 一、认证方式

除健康检查端点及少数公开端点外，所有接口均需携带 **JWT Bearer Token**。

```
Authorization: Bearer <token>
```

Token 通过 `/api/user/login`（普通用户）或 `/api/sys_admin/login`（系统管理员）登录接口获取。

---

## 二、通用响应格式

```json
{
  "code": 0,
  "msg": "success",
  "data": { ... }
}
```

| 字段   | 类型    | 说明                    |
|--------|---------|-------------------------|
| `code` | integer | 0 = 成功，非 0 = 错误   |
| `msg`  | string  | 提示信息                |
| `data` | any     | 响应数据，失败时为 null  |

---

## 三、API 模块

### 1. 健康检查（Health Check）

> 前缀：`/`（无前缀）

| 方法 | 路径      | 描述                                | 需要认证 |
|------|-----------|-------------------------------------|----------|
| GET  | `/health` | 服务存活状态检查                    | 否       |
| GET  | `/ready`  | 就绪检查（检测 MySQL / Redis 连接） | 否       |

---

### 2. 用户模块（User）

> 前缀：`/api/user`

#### 2.1 认证与首页

| 方法 | 路径                            | 描述                                | 需要认证 |
|------|---------------------------------|-------------------------------------|----------|
| POST | `/api/user/login`               | 用户登录，返回 JWT Token            | 否       |
| GET  | `/api/user/index`               | 获取用户首页数据                    | 是       |
| GET  | `/api/user/statistical`         | 获取用户个人统计数据                | 是       |
| GET  | `/api/user/team_statistical`    | 获取团队统计数据（主管视角）        | 是       |
| GET  | `/api/user/weekly_activity`     | 获取本周活动概览（每天进度更新条数）| 是       |
| GET  | `/api/user/alert_tasks`         | 获取待关注任务（7天内到期或已超期） | 是       |
| GET  | `/api/user/latest_news`         | 获取最新动态（分页）                | 是       |

#### 2.2 用户管理

| 方法   | 路径                                   | 描述                              | 需要认证 |
|--------|----------------------------------------|-----------------------------------|----------|
| GET    | `/api/user/mgmt/users`                 | 用户列表（分页、关键词、部门筛选）| 是       |
| POST   | `/api/user/mgmt/user`                  | 创建用户                          | 是       |
| GET    | `/api/user/mgmt/user/<work_no>`        | 获取用户详情                      | 是       |
| PUT    | `/api/user/mgmt/user/<work_no>`        | 更新用户信息                      | 是       |
| DELETE | `/api/user/mgmt/user/<work_no>`        | 删除用户                          | 是       |
| GET    | `/api/user/mgmt/departments`           | 获取部门列表                      | 是       |
| POST   | `/api/user/mgmt/departments`           | 新建部门                          | 是       |
| DELETE | `/api/user/mgmt/departments/<dept_id>` | 删除部门（仅限手动创建）          | 是       |

#### 2.3 上下级关系管理

| 方法   | 路径                                     | 描述               | 需要认证 |
|--------|------------------------------------------|--------------------|----------|
| GET    | `/api/user/mgmt/hierarchy`               | 获取所有上下级关系 | 是       |
| POST   | `/api/user/mgmt/hierarchy`               | 设置上下级关系     | 是       |
| DELETE | `/api/user/mgmt/hierarchy/<relation_id>` | 删除上下级关系     | 是       |
| GET    | `/api/user/mgmt/<work_no>/subordinates`  | 获取下属列表       | 是       |
| GET    | `/api/user/mgmt/<work_no>/supervisors`   | 获取上级列表       | 是       |
| GET    | `/api/user/mgmt/<work_no>/team`          | 获取团队树         | 是       |

#### 2.4 个人查询

| 方法 | 路径                                        | 描述               | 需要认证 |
|------|---------------------------------------------|--------------------|----------|
| GET  | `/api/user/project`                         | 我的项目列表       | 是       |
| GET  | `/api/user/temporary_duty`                  | 我的 AR 列表       | 是       |
| GET  | `/api/user/project/my_apply`                | 我的项目申请列表   | 是       |
| GET  | `/api/user/temporary_duty/my_apply`         | 我的任务申请列表   | 是       |
| PUT  | `/api/user/project/apply/<apply_id>`        | 撤回项目申请       | 是       |
| PUT  | `/api/user/temporary_duty/apply/<apply_id>` | 撤回任务申请       | 是       |
| GET  | `/api/user/project/audit_record`            | 项目审核记录       | 是       |
| GET  | `/api/user/duty/audit_record`               | 任务审核记录       | 是       |

---

### 3. 专案模块（Project）

> 前缀：`/api/project`

#### 3.1 专案 CRUD 与状态

| 方法   | 路径                                           | 描述                                   | 需要认证 |
|--------|------------------------------------------------|----------------------------------------|----------|
| POST   | `/api/project/project_list`                    | 获取专案列表（支持过滤分页）           | 是       |
| POST   | `/api/project/create_project`                  | 创建专案                               | 是       |
| GET    | `/api/project/<project_id>`                    | 获取专案详情                           | 是       |
| PUT    | `/api/project/<project_id>`                    | 更新专案                               | 是       |
| DELETE | `/api/project/<project_id>`                    | 删除专案                               | 是       |
| PUT    | `/api/project/<project_id>/set_project_pm`     | 设定专案 PM                            | 是       |
| PUT    | `/api/project/<project_id>/set_status`         | 设置专案状态                           | 是       |
| POST   | `/api/project/<project_id>/change_request`     | 提交需求变更申请                       | 是       |
| POST   | `/api/project/<project_id>/submit_for_review`  | 提交专案审核                           | 是       |
| PUT    | `/api/project/<project_id>/is_finished`        | 完结专案                               | 是       |
| POST   | `/api/project/<project_id>/restart`            | 重启专案                               | 是       |
| GET    | `/api/project/<project_id>/gantt_chart`        | 获取甘特图数据                         | 是       |
| GET    | `/api/project/<project_id>/member_dynamics`    | 获取成员动态（分页）                   | 是       |
| GET    | `/api/project/<project_id>/progress_and_hour`  | 获取专案进度与工时                     | 是       |

#### 3.2 专案附件

| 方法   | 路径                                                 | 描述               | 需要认证 |
|--------|------------------------------------------------------|--------------------|----------|
| GET    | `/api/project/<project_id>/files`                    | 获取专案附件列表   | 是       |
| POST   | `/api/project/<project_id>/files`                    | 上传专案附件       | 是       |
| DELETE | `/api/project/<project_id>/files/<file_id>`          | 删除专案附件       | 是       |
| GET    | `/api/project/<project_id>/files/<file_id>/download` | 下载专案附件       | 是       |
| GET    | `/api/project/<project_id>/files/<file_id>/preview`  | 内联预览专案附件   | 是       |

#### 3.3 专案分组

| 方法   | 路径                                    | 描述             | 需要认证 |
|--------|-----------------------------------------|------------------|----------|
| GET    | `/api/project/project_group`            | 获取专案分组列表 | 是       |
| POST   | `/api/project/project_group`            | 新建专案分组     | 是       |
| PUT    | `/api/project/project_group/<group_id>` | 更新专案分组     | 是       |
| DELETE | `/api/project/project_group/<group_id>` | 删除专案分组     | 是       |

#### 3.4 专案报表

| 方法 | 路径                               | 描述                         | 需要认证 |
|------|------------------------------------|------------------------------|----------|
| GET  | `/api/project/report_stats`        | 专案进度报表统计             | 是       |
| GET  | `/api/project/member_report_stats` | 成员报表统计                 | 是       |
| GET  | `/api/project/wbs_overview`        | 专案进度总览（WBS 结构）     | 是       |

#### 3.5 功能任务（Function）

| 方法   | 路径                                                             | 描述                                  | 需要认证 |
|--------|------------------------------------------------------------------|---------------------------------------|----------|
| POST   | `/api/project/<project_id>/add_function`                         | 添加功能任务                          | 是       |
| GET    | `/api/project/<project_id>/function/<function_id>`               | 获取功能任务详情                      | 是       |
| PUT    | `/api/project/<project_id>/function/<function_id>`               | 更新功能任务                          | 是       |
| DELETE | `/api/project/<project_id>/function/<function_id>`               | 删除功能任务                          | 是       |
| POST   | `/api/project/<project_id>/function/<function_id>/reschedule`    | 任务延期（保留原始日期，更新预计完成时间） | 是  |
| POST   | `/api/project/<project_id>/function/<function_id>/submit_completion` | 提交任务完结审核                 | 是       |
| PUT    | `/api/project/<project_id>/function/<function_id>/set_status`    | 设置功能任务状态                      | 是       |
| PUT    | `/api/project/<project_id>/function/<function_id>/allocation`    | 分配功能任务                          | 是       |
| GET    | `/api/project/my_functions`                                      | 当前用户负责的所有跨专案功能任务      | 是       |
| POST   | `/api/project/<project_id>/function_list`                        | 获取专案功能任务列表                  | 是       |
| POST   | `/api/project/<project_id>/functions/task_addition_review`       | 提交执行阶段新增任务审核（批量）      | 是       |

#### 3.6 任务进度（Function Progress）

| 方法 | 路径                                                                                              | 描述               | 需要认证 |
|------|---------------------------------------------------------------------------------------------------|--------------------|----------|
| GET  | `/api/project/<project_id>/function/<function_id>/progress`                                       | 获取功能任务进度列表 | 是     |
| POST | `/api/project/<project_id>/function/<function_id>/progress`                                       | 创建功能任务进度记录 | 是     |
| GET  | `/api/project/<project_id>/function/<function_id>/progress/<progress_id>/files/<file_id>/preview`  | 内联预览进度附件   | 是       |
| GET  | `/api/project/<project_id>/function/<function_id>/progress/<progress_id>/files/<file_id>/download` | 下载进度附件       | 是       |

#### 3.7 审核（Review）

| 方法 | 路径                                          | 描述                           | 需要认证 |
|------|-----------------------------------------------|--------------------------------|----------|
| GET  | `/api/project/review_list`                    | 专案审核列表（审核人视角）     | 是       |
| GET  | `/api/project/my_submitted_reviews`           | 我提交的审核记录（提交人视角） | 是       |
| GET  | `/api/project/all_reviews`                    | 全部审核（专案 + 任务）        | 是       |
| PUT  | `/api/project/review/<review_id>`             | 审核操作（通过/拒绝/退回）     | 是       |
| POST | `/api/project/review/<review_id>/countersign` | 审核加签                       | 是       |

#### 3.8 里程碑（Milestone）

| 方法   | 路径                                                  | 描述               | 需要认证 |
|--------|-------------------------------------------------------|--------------------|----------|
| GET    | `/api/project/<project_id>/milestones`                | 获取里程碑列表     | 是       |
| POST   | `/api/project/<project_id>/milestones`                | 创建里程碑         | 是       |
| PUT    | `/api/project/<project_id>/milestones/<milestone_id>` | 更新里程碑         | 是       |
| DELETE | `/api/project/<project_id>/milestones/<milestone_id>` | 删除里程碑         | 是       |

#### 3.9 需求（Requirement）

| 方法   | 路径                                                                    | 描述                                | 需要认证 |
|--------|-------------------------------------------------------------------------|-------------------------------------|----------|
| POST   | `/api/project/requirements/list`                                        | 全局专案需求列表（分页，按权限过滤）| 是       |
| GET    | `/api/project/<project_id>/requirements`                                | 获取专案需求列表                    | 是       |
| POST   | `/api/project/<project_id>/requirements`                                | 新增需求                            | 是       |
| GET    | `/api/project/<project_id>/requirements/<req_id>`                       | 获取需求详情                        | 是       |
| PUT    | `/api/project/<project_id>/requirements/<req_id>`                       | 更新需求                            | 是       |
| DELETE | `/api/project/<project_id>/requirements/<req_id>`                       | 删除需求                            | 是       |
| POST   | `/api/project/<project_id>/requirements/<req_id>/submit_review`         | 提交需求审核                        | 是       |
| POST   | `/api/project/<project_id>/requirements/batch_review`                   | 批量提交需求审核（创建单一审核单）  | 是       |
| POST   | `/api/project/<project_id>/requirements/<req_id>/shelve`                | 提交需求搁置审核                    | 是       |
| POST   | `/api/project/<project_id>/requirements/<req_id>/files`                 | 上传需求附件                        | 是       |
| DELETE | `/api/project/<project_id>/requirements/<req_id>/files`                 | 删除需求附件记录                    | 是       |
| GET    | `/api/project/<project_id>/requirements/<req_id>/files/<file_id>/preview`  | 预览需求附件                     | 是       |
| GET    | `/api/project/<project_id>/requirements/<req_id>/files/<file_id>/download` | 下载需求附件                     | 是       |

---

### 4. AR 任务模块（Duty / AR）

> 前缀：`/api/temporary_duty`

#### 4.1 AR CRUD 与状态管理

| 方法   | 路径                                           | 描述                        | 需要认证 |
|--------|------------------------------------------------|-----------------------------|----------|
| POST   | `/api/temporary_duty/temporary_duty_list`      | 获取 AR 列表（支持过滤分页）| 是       |
| POST   | `/api/temporary_duty/create_temporary_duty`    | 创建 AR                     | 是       |
| GET    | `/api/temporary_duty/<duty_id>`                | 获取 AR 详情                | 是       |
| PUT    | `/api/temporary_duty/<duty_id>`                | 更新 AR                     | 是       |
| DELETE | `/api/temporary_duty/<duty_id>`                | 删除 AR                     | 是       |
| POST   | `/api/temporary_duty/<duty_id>/activate`       | 激活任务（草稿 → 进行中）   | 是       |
| POST   | `/api/temporary_duty/<duty_id>/hold`           | 搁置任务（进行中 → 搁置）   | 是       |
| POST   | `/api/temporary_duty/<duty_id>/resume`         | 恢复任务（搁置 → 进行中）   | 是       |
| POST   | `/api/temporary_duty/<duty_id>/reschedule`     | 任务延期（更新预计完成时间）| 是       |
| POST   | `/api/temporary_duty/<duty_id>/submit_completion` | 提交完结审核             | 是       |
| PUT    | `/api/temporary_duty/<duty_id>/allocation`     | 分配 AR                     | 是       |
| PUT    | `/api/temporary_duty/<duty_id>/set_status`     | 设置任务状态                | 是       |
| GET    | `/api/temporary_duty/<duty_id>/files`          | 获取任务文件列表            | 是       |
| GET    | `/api/temporary_duty/tasklist`                 | 任务清单                    | 是       |

#### 4.2 AR 进度

| 方法 | 路径                                                                           | 描述                       | 需要认证 |
|------|--------------------------------------------------------------------------------|----------------------------|----------|
| GET  | `/api/temporary_duty/progress`                                                 | 获取未读进度数量           | 是       |
| GET  | `/api/temporary_duty/<duty_id>/progress`                                       | 获取任务进度列表（分页）   | 是       |
| POST | `/api/temporary_duty/<duty_id>/progress`                                       | 创建任务进度记录           | 是       |
| POST | `/api/temporary_duty/progress-inline-image`                                    | 上传进度富文本内嵌图片     | 是       |
| GET  | `/api/temporary_duty/progress-inline-image/<filename>`                         | 获取进度富文本内嵌图片     | 否       |
| GET  | `/api/temporary_duty/<duty_id>/progress/<progress_id>/files/<file_id>/preview` | 预览进度附件               | 是       |

#### 4.3 AR 审核

| 方法 | 路径                                                   | 描述                         | 需要认证 |
|------|--------------------------------------------------------|------------------------------|----------|
| GET  | `/api/temporary_duty/review_list`                      | 获取任务审核列表             | 是       |
| PUT  | `/api/temporary_duty/review/<review_id>`               | 审核操作（通过/拒绝/退回）   | 是       |
| POST | `/api/temporary_duty/review/<review_id>/countersign`   | 审核加签                     | 是       |
| POST | `/api/temporary_duty/<duty_id>/req_task_review`        | 提交需求任务新增审核         | 是       |
| POST | `/api/temporary_duty/batch_req_task_review`            | 批量提交需求任务新增审核     | 是       |

---

### 5. 成员分组模块（Group）

> 前缀：`/api/group`

| 方法 | 路径                                           | 描述                       | 需要认证 |
|------|------------------------------------------------|----------------------------|----------|
| GET  | `/api/group/member`                            | 成员列表（分页、关键词）   | 是       |
| GET  | `/api/group/member/<work_no>/project_list`     | 成员专案列表               | 是       |
| GET  | `/api/group/member/<work_no>/temporary_duty_list` | 成员 AR 列表            | 是       |
| POST | `/api/group/member/<work_no>/statistical_data` | 成员统计数据（按日期范围） | 是       |
| POST | `/api/group/member/<work_no>/overview`         | 成员总览（按日期范围）     | 是       |
| GET  | `/api/group/member/<work_no>/schedule`         | 成员日程                   | 是       |
| GET  | `/api/group/member/<work_no>/produce_report`   | 生成成员报告               | 是       |
| POST | `/api/group/member/<work_no>/send_report`      | 发送成员报告至邮件         | 是       |

---

### 6. 统计模块（Statistics）

> 前缀：`/api/statistics`

| 方法 | 路径                             | 描述                                          | 需要认证 |
|------|----------------------------------|-----------------------------------------------|----------|
| GET  | `/api/statistics/member_stats`   | 成员工作统计（当前用户直接/间接下属）         | 是       |
| GET  | `/api/statistics/personal_stats` | 个人详细工时分析（专案分布/分类分布/周加班）  | 是       |
| GET  | `/api/statistics/progress_report` | 进度报告（按日期范围返回成员进度汇整）       | 是       |
| GET  | `/api/statistics/anomalies`      | 异常管理看板（自动检测下属异常项目）          | 是       |

---

### 7. 日报模块（Daily Log）

> 前缀：`/api/daily_log`

| 方法 | 路径                                              | 描述                                     | 需要认证 |
|------|---------------------------------------------------|------------------------------------------|----------|
| GET  | `/api/daily_log`                                  | 日报列表（分页、日期范围、工号、状态）   | 是       |
| POST | `/api/daily_log`                                  | 创建日报                                 | 是       |
| GET  | `/api/daily_log/suggest`                          | 从当天任务进度生成日志建议条目           | 是       |
| GET  | `/api/daily_log/task_entries`                     | 查询指定任务在所有日志中的手动条目       | 是       |
| POST | `/api/daily_log/sync_task_progress`               | 将日志中修改的进度值同步到任务表         | 是       |
| POST | `/api/daily_log/revert_task_progress`             | 删除日志条目后回滚任务进度               | 是       |
| GET  | `/api/daily_log/<log_id>`                         | 获取日报详情                             | 是       |
| PUT  | `/api/daily_log/<log_id>`                         | 更新日报                                 | 是       |
| GET  | `/api/daily_log/<log_id>/files/<file_id>/preview` | 预览/下载日报附件                        | 是       |
| POST | `/api/daily_log/<log_id>/upload`                  | 上传日报附件                             | 是       |

---

### 8. 全局搜索模块（Search）

> 前缀：`/api`

| 方法 | 路径           | 描述                                      | 需要认证 |
|------|----------------|-------------------------------------------|----------|
| POST | `/api/search`  | 全局搜索（支持关键词、类型、分页）        | 是       |
| POST | `/api/_paths`  | 批量解析路径（通过 ID 列表获取路径信息）  | 是       |

---

### 9. 管理员模块（Admin）

> 前缀：`/api/admin`
> 说明：写操作需要管理员或主管角色

| 方法   | 路径                                   | 描述                                 | 需要认证 |
|--------|----------------------------------------|--------------------------------------|----------|
| GET    | `/api/admin/project_group`             | 获取专案分组列表（所有已登录用户可访问） | 是    |
| POST   | `/api/admin/project_group`             | 新建专案分组（管理员或主管）         | 是       |
| PUT    | `/api/admin/project_group/<group_id>`  | 更新专案分组（管理员或主管）         | 是       |
| DELETE | `/api/admin/project_group/<group_id>`  | 删除专案分组（管理员或主管）         | 是       |

---

### 10. 系统管理员模块（System Admin）

> 前缀：`/api/sys_admin`
> 说明：除登录外，所有接口均需系统管理员权限（JWT claims 中 `is_admin=true`）

| 方法   | 路径                                           | 描述                                       | 需要认证 |
|--------|------------------------------------------------|--------------------------------------------|----------|
| POST   | `/api/sys_admin/login`                         | 系统管理员登录                             | 否       |
| GET    | `/api/sys_admin/dashboard`                     | 管理员仪表盘总览                           | 是       |
| GET    | `/api/sys_admin/users`                         | 获取所有用户列表（含禁用用户）             | 是       |
| PUT    | `/api/sys_admin/users/<work_no>/status`        | 启用/禁用用户                              | 是       |
| PUT    | `/api/sys_admin/users/<work_no>/reset_password` | 重置用户密码                              | 是       |
| GET    | `/api/sys_admin/roles`                         | 获取所有角色列表                           | 是       |
| GET    | `/api/sys_admin/users/<work_no>/role`          | 获取用户角色及下属信息                     | 是       |
| PUT    | `/api/sys_admin/users/<work_no>/role`          | 设置/清除用户角色（role_code=null 则清除） | 是       |
| PUT    | `/api/sys_admin/users/<work_no>/subordinates`  | 替换用户下属列表                           | 是       |
| GET    | `/api/sys_admin/system_config`                 | 获取系统配置列表                           | 是       |
| PUT    | `/api/sys_admin/system_config`                 | 批量更新系统配置                           | 是       |
| GET    | `/api/sys_admin/operation_logs`                | 获取操作日志（分页，可按工号/操作/日期筛选）| 是      |
| GET    | `/api/sys_admin/admins`                        | 获取管理员账号列表                         | 是       |
| POST   | `/api/sys_admin/admins`                        | 新增管理员账号                             | 是       |
| DELETE | `/api/sys_admin/admins/<admin_id>`             | 删除管理员账号                             | 是       |

---

### 11. 首页 Widget 配置模块（Dashboard Config）

> 前缀：`/api/dashboard`

| 方法 | 路径                    | 描述                                              | 需要认证 |
|------|-------------------------|---------------------------------------------------|----------|
| GET  | `/api/dashboard/config` | 获取当前用户 Widget 配置（view_type=personal\|manager） | 是  |
| PUT  | `/api/dashboard/config` | 保存当前用户 Widget 可见性配置                    | 是       |

---

### 12. 消息通知模块（Notification）

> 前缀：`/api/notification`

| 方法  | 路径                                 | 描述                           | 需要认证 |
|-------|--------------------------------------|--------------------------------|----------|
| GET   | `/api/notification/list`             | 获取当前用户通知列表（分页）   | 是       |
| PATCH | `/api/notification/<notif_id>/read`  | 标记单条通知为已读             | 是       |
| PATCH | `/api/notification/read_all`         | 标记全部通知为已读             | 是       |
| POST  | `/api/notification/remind_daily_log` | 向指定成员发送今日日报填写提醒（支持批量） | 是 |

---

### 13. 会议备注模块（Meeting Note）

> 前缀：`/api`

| 方法   | 路径                                          | 描述                              | 需要认证 |
|--------|-----------------------------------------------|-----------------------------------|----------|
| GET    | `/api/project/<project_id>/meeting_notes`     | 获取专案的所有会议备注            | 是       |
| POST   | `/api/project/<project_id>/meeting_notes`     | 新增会议备注                      | 是       |
| PUT    | `/api/meeting_notes/<note_id>/status`         | 切换备注状态（pending ↔ resolved）| 是       |
| DELETE | `/api/meeting_notes/<note_id>`                | 删除会议备注                      | 是       |

---

### 14. 独立需求模块（Standalone Req）

> 前缀：`/api/standalone_req`

| 方法   | 路径                                                    | 描述               | 需要认证 |
|--------|---------------------------------------------------------|--------------------|----------|
| POST   | `/api/standalone_req/list`                              | 获取独立需求列表   | 是       |
| POST   | `/api/standalone_req/create`                            | 创建独立需求       | 是       |
| GET    | `/api/standalone_req/<req_id>`                          | 获取需求详情       | 是       |
| PUT    | `/api/standalone_req/<req_id>`                          | 更新需求           | 是       |
| DELETE | `/api/standalone_req/<req_id>`                          | 删除需求           | 是       |
| GET    | `/api/standalone_req/<req_id>/files`                    | 获取需求附件列表   | 是       |
| POST   | `/api/standalone_req/<req_id>/files`                    | 上传需求附件       | 是       |
| DELETE | `/api/standalone_req/<req_id>/files`                    | 删除需求附件       | 是       |
| POST   | `/api/standalone_req/batch_submit_review`               | 批量提交审核       | 是       |
| POST   | `/api/standalone_req/<req_id>/submit_review`            | 提交单条需求审核   | 是       |
| POST   | `/api/standalone_req/<req_id>/review_result`            | 审核结果（通过/拒绝）| 是     |
| GET    | `/api/standalone_req/<req_id>/files/<file_id>/preview`  | 预览需求附件       | 是       |
| GET    | `/api/standalone_req/<req_id>/files/<file_id>/download` | 下载需求附件       | 是       |

---

### 15. 系统模块（System）

> 前缀：`/api/system`
> 说明：创建/更新/删除操作需要管理员权限（role_code=admin 或 system_admin）

| 方法   | 路径                      | 描述                                | 需要认证 |
|--------|---------------------------|-------------------------------------|----------|
| GET    | `/api/system/report_stats` | 系统需求与任务统计报表             | 是       |
| POST   | `/api/system/list`         | 获取系统列表（所有已登录用户可查）  | 是       |
| GET    | `/api/system/groups`       | 获取所有系统分组                    | 是       |
| POST   | `/api/system/create`       | 创建系统（仅管理员）                | 是       |
| GET    | `/api/system/<system_id>`  | 获取系统详情（所有已登录用户可查）  | 是       |
| PUT    | `/api/system/<system_id>`  | 更新系统（仅管理员）                | 是       |
| DELETE | `/api/system/<system_id>`  | 删除系统（仅管理员）                | 是       |

---

## 四、错误码说明

| code  | 说明                   |
|-------|------------------------|
| 0     | 成功                   |
| 40000 | 参数校验失败           |
| 40100 | 未认证或 Token 无效    |
| 40300 | 权限不足               |
| 40400 | 资源不存在             |
| 50000 | 服务器内部错误         |
