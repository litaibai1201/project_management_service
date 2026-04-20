# -*- coding: utf-8 -*-
"""
@文件: routes.py
@说明: 统一管理所有蓝图注册和 URL 前缀
@时间: 2026/02/04

设计理念：
  - 集中管理蓝图注册和 URL 前缀
  - API 文档由 flask-smorest 自动生成（Swagger UI）
  - 无需重复维护元数据

使用方式：
  在 app.py 中：
  from urls import BLUEPRINTS

  for blp, config_dict in BLUEPRINTS:
      api.register_blueprint(blp, **config_dict)

添加新 API：
  1. 在 views/ 中创建蓝图
  2. 在下方 BLUEPRINTS 列表中注册
  3. 完成！无需修改其他地方
"""

from views.test_api import blp as test_blp
from views.health_api import blp as health_blp
from views.async_api import blp as async_blp

# ─── 业务蓝图 ───────────────────────────────────────────────────────────────
from views.user_api import blp as user_blp
from views.project_api import blp as project_blp
from views.duty_api import blp as duty_blp
from views.group_api import blp as group_blp
from views.statistics_api import blp as statistics_blp
from views.daily_log_api import blp as daily_log_blp
from views.search_api import blp as search_blp
from views.admin_api import blp as admin_blp
from views.system_admin_api import blp as system_admin_blp
from views.dashboard_config_api import blp as dashboard_config_blp
from views.meeting_note_api import blp as meeting_note_blp

# ==================== 蓝图注册配置 ====================
# 格式: (蓝图对象, URL 前缀配置)
#
# 前端 API 调用地址映射：
#   /api/user/*           → user_blp       (登录、用户管理、层级、个人查询)
#   /api/project/*        → project_blp    (项目、功能任务、里程碑、审核)
#   /api/temporary_duty/* → duty_blp       (临时任务、进度、审核)
#   /api/group/*          → group_blp      (成员管理、报告)
#   /api/statistics/*     → statistics_blp (统计)
#   /api/daily_log        → daily_log_blp  (日报)
#   /api/search、/_paths  → search_blp     (全局搜索)
#   /api/admin/*          → admin_blp      (管理员：专案分组管理)
#
BLUEPRINTS = [
    # 系统蓝图
    (health_blp,     {"url_prefix": ""}),
    (test_blp,       {"url_prefix": "/api/test"}),
    (async_blp,      {"url_prefix": "/api/async"}),

    # 业务蓝图
    (user_blp,       {"url_prefix": "/api/user"}),
    (project_blp,    {"url_prefix": "/api/project"}),
    (duty_blp,       {"url_prefix": "/api/temporary_duty"}),
    (group_blp,      {"url_prefix": "/api/group"}),
    (statistics_blp, {"url_prefix": "/api/statistics"}),
    (daily_log_blp,  {"url_prefix": "/api/daily_log"}),
    (search_blp,     {"url_prefix": "/api"}),
    (admin_blp,             {"url_prefix": "/api/admin"}),
    (system_admin_blp,      {"url_prefix": "/api/sys_admin"}),
    (dashboard_config_blp,  {"url_prefix": "/api/dashboard"}),
    (meeting_note_blp,      {"url_prefix": "/api"}),
]
