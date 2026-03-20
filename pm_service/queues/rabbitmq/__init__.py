# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: RabbitMQ 消息队列模块
@时间: 2025-09-03

RabbitMQ 是一个开源的消息代理和队列服务器，用于应用间的异步通信。

使用示例:
    from queues.rabbitmq import rabbitmq_client, RabbitMQProducer, RabbitMQConsumer

    # 1. 初始化 (在 app.py 中)
    rabbitmq_client.init_app(app)

    # 2. 发送消息
    producer = RabbitMQProducer()
    producer.send_to_queue('hello', 'Hello World!')

    # 3. 接收消息
    def callback(channel, method, properties, body):
        print(f"Received: {body}")
        channel.basic_ack(delivery_tag=method.delivery_tag)

    consumer = RabbitMQConsumer()
    consumer.consume('hello', callback)

核心概念:
    - Exchange: 交换机，接收消息并路由到队列
    - Queue: 队列，存储消息
    - Binding: 绑定，Exchange 和 Queue 的关系
    - Routing Key: 路由键，用于消息路由
    - Channel: 信道，逻辑连接，复用 TCP 连接

Exchange 类型:
    - direct: 直连交换机，精确匹配 routing key
    - topic: 主题交换机，支持通配符（* 匹配一个词，# 匹配多个词）
    - fanout: 扇出交换机，广播消息到所有绑定的队列
    - headers: 头交换机，根据消息头属性路由

消息模式:
    - Simple: 简单模式，一对一
    - Work Queue: 工作队列，多个消费者竞争消费
    - Publish/Subscribe: 发布订阅，广播消息
    - Routing: 路由模式，根据 routing key 路由
    - Topics: 主题模式，支持通配符路由
    - RPC: 远程调用，请求/响应模式

适用场景:
    - 应用解耦：服务之间异步通信
    - 流量削峰：缓冲高峰期请求
    - 异步处理：耗时操作异步执行
    - 消息分发：一对多消息推送
    - 延迟队列：定时任务、延迟通知

启动 RabbitMQ:
    # Docker 方式
    docker run -d --name rabbitmq \
        -p 5672:5672 \
        -p 15672:15672 \
        rabbitmq:3-management

    # 访问管理界面
    http://localhost:15672
    默认用户名/密码: guest/guest

最佳实践:
    1. 消息持久化：设置 delivery_mode=2
    2. 队列持久化：声明队列时设置 durable=True
    3. 消息确认：消费者处理完成后手动 ack
    4. 预取限制：设置 prefetch_count 避免消费者过载
    5. 死信队列：处理失败消息
    6. 消息 TTL：设置消息过期时间
    7. 队列长度限制：避免队列无限增长
"""

from .client import RabbitMQClientManager, rabbitmq_client
from .producer import RabbitMQProducer
from .consumer import RabbitMQConsumer

__all__ = [
    "RabbitMQClientManager",
    "rabbitmq_client",
    "RabbitMQProducer",
    "RabbitMQConsumer",
]
