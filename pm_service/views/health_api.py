# -*- coding: utf-8 -*-
"""
@文件: health_api.py
@说明: 健康检查端点
@时间: 2023/10/19
"""
from flask.views import MethodView
from flask_smorest import Blueprint

from cache import redis_client
from dbs.mysql_db import db

blp = Blueprint("health_api", __name__)


@blp.route("/health")
class HealthCheck(MethodView):
    """健康检查 - 服务存活状态"""

    def get(self):
        return {"status": "healthy"}


@blp.route("/ready")
class ReadinessCheck(MethodView):
    """就绪检查 - 检查依赖服务连接"""

    def get(self):
        checks = {
            "mysql": self._check_mysql(),
            "redis": self._check_redis(),
        }
        all_healthy = all(checks.values())
        return {
            "status": "ready" if all_healthy else "not_ready",
            "checks": checks,
        }, 200 if all_healthy else 503

    def _check_mysql(self):
        try:
            db.session.execute(db.text("SELECT 1"))
            return True
        except Exception:
            return False

    def _check_redis(self):
        try:
            redis_client.ping()
            return True
        except Exception:
            return False
