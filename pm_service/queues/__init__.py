# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 队列模块
@时间: 2025-09-03

队列模块包含任务队列和消息队列的基础封装。

模块结构:
    - celery_queue/: Celery 分布式任务队列
    - rabbitmq/: RabbitMQ 消息队列

使用示例:
    # Celery 任务队列
    from queues.celery_queue import celery_app

    # RabbitMQ 消息队列
    from queues.rabbitmq import rabbitmq_client, RabbitMQProducer, RabbitMQConsumer
"""

__all__ = []
