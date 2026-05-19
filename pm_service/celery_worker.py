# -*- coding: utf-8 -*-
"""
Celery Worker 入口文件

启动命令（在 pm_service 目录下）：
    celery -A celery_worker.celery worker --loglevel=info --pool=solo
    celery -A celery_worker.celery worker --beat --loglevel=info --pool=solo
"""
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from queues.celery_queue import celery_app as celery_mgr

# 创建 Flask app（同时触发 celery_mgr.init_app）
flask_app = create_app()

# 导出 Celery 实例供 worker 使用
celery = celery_mgr.app

# 注册所有任务模块（确保 worker 能发现任务）
with flask_app.app_context():
    import tasks.dingtalk_tasks       # noqa: F401
    import tasks.notification_tasks   # noqa: F401
