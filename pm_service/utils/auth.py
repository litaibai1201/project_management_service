# -*- coding: utf-8 -*-
"""
@文件: auth.py
@说明: JWT 身份验证封装
@时间: 2026/02/06
"""
from datetime import timedelta
from flask_jwt_extended import JWTManager, create_access_token, jwt_required as _jwt_required, get_jwt_identity
from configs.base import BaseConfig


class AuthManager:
    def __init__(self, app=None):
        self.jwt = JWTManager()
        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        # 从 BaseConfig 读取 JWT 配置
        app.config.setdefault("JWT_SECRET_KEY", BaseConfig.JWT_SECRET_KEY)
        app.config.setdefault("JWT_ACCESS_TOKEN_EXPIRES", timedelta(seconds=BaseConfig.JWT_ACCESS_TOKEN_EXPIRES))
        app.config.setdefault("JWT_REFRESH_TOKEN_EXPIRES", timedelta(seconds=BaseConfig.JWT_REFRESH_TOKEN_EXPIRES))
        self.jwt.init_app(app)


def create_token(identity: str, additional_claims: dict = None):
    """创建访问 token"""
    return create_access_token(identity=identity, additional_claims=additional_claims or {})


# 便捷导出 jwt_required
def jwt_required(*args, **kwargs):
    return _jwt_required(*args, **kwargs)


def get_identity():
    return get_jwt_identity()
