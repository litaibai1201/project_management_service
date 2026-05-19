# -*- coding: utf-8 -*-
"""
@文件: app.py
@说明: server启动文件
@时间: 2023/10/19 19:09:13
"""
from dotenv import load_dotenv

load_dotenv()  # 加载 .env 文件中的环境变量

import os

from flask import Flask
from flask_cors import CORS
from flask_marshmallow import Marshmallow
from flask_smorest import Api

from cache import redis_client
from utils.auth import AuthManager
from utils.error_handler import register_error_handlers
from utils.rate_limit import init_app as init_rate_limit
from configs import config
from dbs.mysql_db import db
from loggers import logger, flask_hooks
from urls import BLUEPRINTS
from urls.api_docs import print_api_info
from utils.api_docs_enhanced import enhance_api_docs


def create_app(config_name=None):
    """应用工厂函数"""
    if config_name is None:
        # 支持 "development"→"dev", "production"→"prd" 的自动映射
        raw = os.environ.get("FLASK_ENV", "dev")
        config_name = {"development": "dev", "production": "prd"}.get(raw, raw)

    app = Flask(__name__)

    # 加载配置
    app.config.from_object(config[config_name]())

    # 应用 SQLAlchemy 引擎选项（连接池配置），可由环境或具体配置覆盖
    engine_opts = app.config.get('SQLALCHEMY_ENGINE_OPTIONS')
    if engine_opts:
        # 确保 Flask-SQLAlchemy 能读取这些选项
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = engine_opts

    # CORS 配置
    CORS(app, supports_credentials=True)
    app.config["Access-Control-Allow-Origin"] = "*"

    # 初始化扩展
    db.init_app(app)
    from dbs.mysql_db.auto_migrate import auto_migrate
    auto_migrate(app, db)
    
    # 初始化 Redis 客户端（现代化实现）
    try:
        redis_client.init_app(app)
        logger.info("✓ Redis 初始化成功")
    except Exception as e:
        logger.error("Redis 初始化失败", category="error", event="redis_init_failed", error=e)
        if app.config.get("REDIS_REQUIRED", True):
            raise  # 如果 Redis 是必需的，则抛出异常

    # 初始化 MongoDB 客户端
    try:
        from dbs.mongo_db.client import mongo_client
        mongo_client.init_app(app)
        # 确保日志集合索引存在
        from controllers.daily_log_controller import DailyLogController
        DailyLogController.ensure_indexes()
        logger.info("✓ MongoDB 初始化成功")
    except Exception as e:
        logger.error("MongoDB 初始化失败", category="error", event="mongo_init_failed", error=str(e))
        if app.config.get("MONGO_REQUIRED", True):
            raise
    
    marsh = Marshmallow()
    marsh.init_app(app)
    # 初始化 JWT 管理
    auth_manager = AuthManager()
    auth_manager.init_app(app)
    # 初始化速率限制（Flask-Limiter）
    init_rate_limit(app)
    
    # 初始化 Flask 钩子（启用请求/响应/SQL 日志和追踪功能）
    # 该钩子集成了：
    # - HTTP 请求/响应自动日志记录
    # - SQL 查询追踪和性能监控
    # - Request ID 生成和全链路追踪支持
    # - 标准化响应头（X-Request-ID、X-Response-Time）
    flask_hooks.init_app(app, db, enable_db_logging=True)
    
    # 注册全局错误处理器
    register_error_handlers(app)

    # 初始化 Celery（需在 Flask app 创建后调用）
    try:
        from queues.celery_queue import celery_app as _celery_mgr
        _celery_mgr.init_app(app)
        logger.info("✓ Celery 初始化成功")
    except Exception as e:
        logger.warning(f"Celery 初始化失败（任务队列不可用）: {e}")

    # 注册蓝图
    api = Api(app)
    # 增强 API 文档元信息并启用 JWT Bearer 在 swagger 中的展示
    enhance_api_docs(app, api)
    for blp, config_dict in BLUEPRINTS:
        api.register_blueprint(blp, **config_dict)

    return app


if __name__ == "__main__":
    app = create_app()
    print_api_info()  # 启动时打印蓝图信息
    print("===================server starting============================")
    app.run(
        app.config["SERVER_HOST"], 
        app.config["SERVER_PORT"], 
        debug=app.config["DEBUG"]
    )
