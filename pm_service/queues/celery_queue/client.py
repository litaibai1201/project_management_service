# -*- coding: utf-8 -*-
"""
@文件: client.py
@说明: Celery 客户端管理器
@时间: 2025-09-03

Celery 是一个分布式任务队列系统，用于处理异步任务和定时任务。

核心概念:
    - Broker: 消息代理，用于传递任务消息（Redis/RabbitMQ）
    - Worker: 工作进程，执行任务
    - Task: 异步任务单元
    - Result Backend: 结果存储后端（Redis/数据库）
    - Beat: 定时任务调度器

配置项:
    CELERY_BROKER_URL: 消息代理地址（默认使用 Redis）
    CELERY_RESULT_BACKEND: 结果存储后端（默认使用 Redis）
    CELERY_TASK_SERIALIZER: 任务序列化方式（json/pickle/yaml）
    CELERY_RESULT_SERIALIZER: 结果序列化方式
    CELERY_TIMEZONE: 时区设置
    CELERY_ENABLE_UTC: 是否启用 UTC 时间
    CELERY_TASK_TRACK_STARTED: 是否追踪任务启动状态
    CELERY_TASK_TIME_LIMIT: 任务硬超时时间（秒）
    CELERY_TASK_SOFT_TIME_LIMIT: 任务软超时时间（秒）
    CELERY_WORKER_MAX_TASKS_PER_CHILD: 每个 worker 子进程最大任务数

使用示例:
    from dbs.celery_queue import celery_app

    # 在 app.py 中初始化
    celery_app.init_app(app)

    # 定义任务
    @celery_app.task
    def add(x, y):
        return x + y

    # 异步调用
    result = add.delay(4, 6)

    # 获取结果
    if result.ready():
        print(result.get())
"""

import os
from typing import Optional, Any, Dict
from celery import Celery, Task
from celery.schedules import crontab
from kombu import Queue, Exchange

from loggers import logger


_flask_app = None  # 由 CeleryClientManager.init_app() 设置


class FlaskTask(Task):
    """Flask 集成的 Celery Task 基类

    确保任务在 Flask 应用上下文中执行
    """

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """执行任务时自动推入 Flask 应用上下文"""
        if _flask_app is not None:
            with _flask_app.app_context():
                return self.run(*args, **kwargs)
        return self.run(*args, **kwargs)


class CeleryClientManager:
    """Celery 客户端管理器

    提供 Celery 应用的初始化、配置和管理功能。

    配置项:
        CELERY_BROKER_URL: 消息代理地址
        CELERY_RESULT_BACKEND: 结果存储后端
        CELERY_TIMEZONE: 时区（默认 Asia/Shanghai）

    属性:
        app: Celery 应用实例

    方法:
        init_app(app): Flask 应用初始化
        get_task_info(task_id): 获取任务信息
        revoke_task(task_id): 撤销任务
    """

    def __init__(self):
        """初始化 Celery 客户端管理器"""
        self._celery_app: Optional[Celery] = None
        logger.info("Celery 客户端管理器已初始化")

    @property
    def app(self) -> Celery:
        """获取 Celery 应用实例

        Returns:
            Celery 应用实例

        Raises:
            RuntimeError: 如果 Celery 未初始化
        """
        if self._celery_app is None:
            raise RuntimeError(
                "Celery 未初始化，请先调用 init_app() 方法"
            )
        return self._celery_app

    def init_app(self, app) -> None:
        """Flask 应用初始化

        Args:
            app: Flask 应用实例

        配置优先级: 环境变量 > .env 配置 > 默认值
        """
        global _flask_app
        _flask_app = app
        try:
            # 获取配置
            broker_url = (
                app.config.get("CELERY_BROKER_URL")
                or os.environ.get("CELERY_BROKER_URL")
                or f"redis://{app.config.get('REDIS_HOST', '127.0.0.1')}:{app.config.get('REDIS_PORT', 6379)}/1"
            )

            result_backend = (
                app.config.get("CELERY_RESULT_BACKEND")
                or os.environ.get("CELERY_RESULT_BACKEND")
                or f"redis://{app.config.get('REDIS_HOST', '127.0.0.1')}:{app.config.get('REDIS_PORT', 6379)}/2"
            )

            timezone = (
                app.config.get("CELERY_TIMEZONE")
                or os.environ.get("CELERY_TIMEZONE")
                or "Asia/Shanghai"
            )

            # 创建 Celery 应用
            self._celery_app = Celery(
                app.import_name,
                broker=broker_url,
                backend=result_backend,
                task_cls=FlaskTask,
            )

            # Celery 配置
            celery_config = {
                # 结果后端配置
                'result_backend': result_backend,
                'result_expires': int(
                    app.config.get("CELERY_RESULT_EXPIRES")
                    or os.environ.get("CELERY_RESULT_EXPIRES")
                    or 3600
                ),

                # 序列化配置
                'task_serializer': (
                    app.config.get("CELERY_TASK_SERIALIZER")
                    or os.environ.get("CELERY_TASK_SERIALIZER")
                    or "json"
                ),
                'result_serializer': (
                    app.config.get("CELERY_RESULT_SERIALIZER")
                    or os.environ.get("CELERY_RESULT_SERIALIZER")
                    or "json"
                ),
                'accept_content': ['json', 'pickle'],

                # 时区配置
                'timezone': timezone,
                'enable_utc': str(
                    app.config.get("CELERY_ENABLE_UTC", "true")
                ).lower() == "true",

                # 任务配置
                'task_track_started': True,
                'task_time_limit': int(
                    app.config.get("CELERY_TASK_TIME_LIMIT")
                    or os.environ.get("CELERY_TASK_TIME_LIMIT")
                    or 3600
                ),
                'task_soft_time_limit': int(
                    app.config.get("CELERY_TASK_SOFT_TIME_LIMIT")
                    or os.environ.get("CELERY_TASK_SOFT_TIME_LIMIT")
                    or 3000
                ),
                'task_acks_late': True,
                'task_reject_on_worker_lost': True,

                # Worker 配置
                'worker_prefetch_multiplier': int(
                    app.config.get("CELERY_WORKER_PREFETCH_MULTIPLIER")
                    or os.environ.get("CELERY_WORKER_PREFETCH_MULTIPLIER")
                    or 4
                ),
                'worker_max_tasks_per_child': int(
                    app.config.get("CELERY_WORKER_MAX_TASKS_PER_CHILD")
                    or os.environ.get("CELERY_WORKER_MAX_TASKS_PER_CHILD")
                    or 1000
                ),

                # 队列配置
                'task_default_queue': 'default',
                'task_default_exchange': 'tasks',
                'task_default_exchange_type': 'topic',
                'task_default_routing_key': 'task.default',

                # 定义队列
                'task_queues': (
                    Queue('default', Exchange('tasks'), routing_key='task.default'),
                    Queue('priority_high', Exchange('tasks'), routing_key='task.priority.high'),
                    Queue('priority_low', Exchange('tasks'), routing_key='task.priority.low'),
                ),

                # 任务路由
                'task_routes': {
                    'dbs.celery_queue.tasks.send_email': {
                        'queue': 'priority_high',
                        'routing_key': 'task.priority.high',
                    },
                    'dbs.celery_queue.tasks.cleanup_temp_files': {
                        'queue': 'priority_low',
                        'routing_key': 'task.priority.low',
                    },
                },
            }

            # 加载 Beat 定时任务配置
            from queues.celery_queue.config import get_beat_schedule
            celery_config['beat_schedule'] = get_beat_schedule()

            # 应用配置
            self._celery_app.conf.update(celery_config)

            # 将 Celery 实例绑定到 Flask app
            app.extensions = getattr(app, 'extensions', {})
            app.extensions['celery'] = self._celery_app

            logger.info(
                "Celery 初始化成功",
                custom={"broker": broker_url, "backend": result_backend, "timezone": timezone},
            )

        except Exception as e:
            logger.error("Celery 初始化失败", category="error", event="celery_init_failed", error=e)
            raise

    def get_task_info(self, task_id: str) -> Dict[str, Any]:
        """获取任务信息

        Args:
            task_id: 任务 ID

        Returns:
            任务信息字典，包含状态、结果等

        示例:
            >>> info = celery_app.get_task_info("task-id-123")
            >>> print(info['status'])  # PENDING/STARTED/SUCCESS/FAILURE
            >>> if info['status'] == 'SUCCESS':
            >>>     print(info['result'])
        """
        result = self.app.AsyncResult(task_id)

        info = {
            'task_id': task_id,
            'status': result.status,
            'ready': result.ready(),
            'successful': result.successful() if result.ready() else None,
            'failed': result.failed() if result.ready() else None,
        }

        # 如果任务完成，获取结果
        if result.ready():
            if result.successful():
                info['result'] = result.get()
            elif result.failed():
                info['error'] = str(result.info)

        # 获取任务信息（如果有）
        if result.info:
            info['info'] = result.info

        return info

    def revoke_task(
        self,
        task_id: str,
        terminate: bool = False,
        signal: str = 'SIGTERM'
    ) -> bool:
        """撤销任务

        Args:
            task_id: 任务 ID
            terminate: 是否强制终止正在执行的任务
            signal: 终止信号（默认 SIGTERM）

        Returns:
            是否成功撤销

        示例:
            >>> # 撤销未开始的任务
            >>> celery_app.revoke_task("task-id-123")

            >>> # 强制终止正在运行的任务
            >>> celery_app.revoke_task("task-id-456", terminate=True)
        """
        try:
            self.app.control.revoke(
                task_id,
                terminate=terminate,
                signal=signal
            )
            logger.info("任务已撤销", custom={"task_id": task_id, "terminate": terminate})
            return True
        except Exception as e:
            logger.error("撤销任务失败", category="error", event="celery_task_revoke_failed", custom={"task_id": task_id}, error=e)
            return False

    def purge_queue(self, queue_name: str = 'default') -> int:
        """清空指定队列中的所有任务

        Args:
            queue_name: 队列名称

        Returns:
            清除的任务数量

        警告:
            此操作会删除队列中的所有待处理任务，请谨慎使用！
        """
        try:
            count = self.app.control.purge()
            logger.warning("队列已清空", custom={"queue": queue_name, "count": count})
            return count
        except Exception as e:
            logger.error("清空队列失败", category="error", event="celery_queue_purge_failed", custom={"queue": queue_name}, error=e)
            return 0

    def get_active_tasks(self) -> Dict[str, Any]:
        """获取所有活跃的任务

        Returns:
            活跃任务信息字典
        """
        try:
            inspect = self.app.control.inspect()
            active = inspect.active()
            return active or {}
        except Exception as e:
            logger.error("获取活跃任务失败", category="error", event="celery_active_tasks_failed", error=e)
            return {}

    def get_scheduled_tasks(self) -> Dict[str, Any]:
        """获取所有已调度的任务

        Returns:
            已调度任务信息字典
        """
        try:
            inspect = self.app.control.inspect()
            scheduled = inspect.scheduled()
            return scheduled or {}
        except Exception as e:
            logger.error("获取已调度任务失败", category="error", event="celery_scheduled_tasks_failed", error=e)
            return {}

    def get_registered_tasks(self) -> Dict[str, Any]:
        """获取所有已注册的任务

        Returns:
            已注册任务列表
        """
        try:
            inspect = self.app.control.inspect()
            registered = inspect.registered()
            return registered or {}
        except Exception as e:
            logger.error("获取已注册任务失败", category="error", event="celery_registered_tasks_failed", error=e)
            return {}


# 创建全局实例
celery_app = CeleryClientManager()
