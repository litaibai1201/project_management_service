# -*- coding: utf-8 -*-
"""
rate_limit.py
速率限制（Flask-Limiter）初始化封装
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# 创建 Limiter 实例（延迟绑定 app）
limiter = Limiter(key_func=get_remote_address)


def init_app(app):
    """初始化限流器。

    支持通过应用配置覆盖：
    - `RATELIMIT_STORAGE_URI` : 存储后端（例如 redis://...），若未设置则使用内存存储（仅开发）
    - `RATELIMIT_DEFAULT` : 默认速率限制规则，示例： ["200 per day", "50 per hour"]
    """
    # 默认限制（可由环境或配置覆盖）
    app.config.setdefault("RATELIMIT_DEFAULT", ["200 per day", "50 per hour"])

    # Flask-Limiter 从 app.config 中读取 `RATELIMIT_STORAGE_URI`，不需要额外传参
    limiter.init_app(app)


__all__ = ["limiter", "init_app"]
