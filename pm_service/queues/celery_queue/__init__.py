# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: Celery 分布式任务队列模块
@时间: 2025-09-03

Celery 是一个分布式任务队列系统，用于处理异步任务、定时任务和后台作业。

使用示例:
    from queues.celery_queue import celery_app

    # 1. 初始化 (在 app.py 中)
    celery_app.init_app(app)

    # 2. 定义任务 (在业务代码中，如 tasks/ 目录)
    # tasks/email_tasks.py
    from queues.celery_queue import celery_app

    @celery_app.app.task(name="tasks.email.send_email")
    def send_email(to, subject, body):
        # 邮件发送逻辑
        return True

    # 3. 异步调用
    from tasks.email_tasks import send_email
    result = send_email.delay("user@example.com", "Hello", "Test")

    # 4. 获取结果
    if result.ready():
        print(result.get())

    # 5. 获取任务信息
    info = celery_app.get_task_info(result.id)
    print(info['status'])

核心概念:
    - Broker: 消息代理（Redis/RabbitMQ），用于传递任务消息
    - Worker: 工作进程，执行异步任务
    - Task: 任务单元，可异步执行的函数
    - Result Backend: 结果存储后端（Redis/数据库）
    - Beat: 定时任务调度器（类似 cron）
    - Queue: 任务队列，支持优先级
    - Chain: 任务链，顺序执行多个任务
    - Group: 任务组，并行执行多个任务
    - Chord: 组合模式，等待一组任务完成后执行回调

适用场景:
    - 异步任务：邮件发送、文件处理、数据导入导出
    - 定时任务：报表生成、数据清理、定时备份
    - 长时间任务：视频转码、图像处理、AI 模型训练
    - 分布式处理：批量数据处理、爬虫任务
    - 延迟任务：订单超时取消、消息延迟发送

启动命令:
    # 启动 Worker
    celery -A queues.celery_queue.client.celery_app.app worker --loglevel=info

    # 启动 Beat 调度器
    celery -A queues.celery_queue.client.celery_app.app beat --loglevel=info

    # 同时启动 Worker 和 Beat
    celery -A queues.celery_queue.client.celery_app.app worker --beat --loglevel=info

    # 启动多个 Worker（并发）
    celery -A queues.celery_queue.client.celery_app.app worker --concurrency=4 --loglevel=info

    # 启动指定队列的 Worker
    celery -A queues.celery_queue.client.celery_app.app worker -Q priority_high --loglevel=info

监控工具:
    # Flower - Web 监控界面
    pip install flower
    celery -A queues.celery_queue.client.celery_app.app flower

    # 访问 http://localhost:5555

最佳实践:
    1. 任务应该是幂等的（多次执行结果相同）
    2. 避免在任务中执行阻塞操作
    3. 合理设置任务超时时间
    4. 使用重试机制处理临时性错误
    5. 任务粒度不宜过大，便于监控和重试
    6. 生产环境使用 RabbitMQ 作为 Broker
    7. 定期清理过期的任务结果
    8. 使用不同队列隔离不同优先级的任务
"""

from .client import CeleryClientManager, celery_app
from .config import CELERY_BEAT_SCHEDULE, get_beat_schedule

__all__ = [
    "CeleryClientManager",
    "celery_app",
    "CELERY_BEAT_SCHEDULE",
    "get_beat_schedule",
]
