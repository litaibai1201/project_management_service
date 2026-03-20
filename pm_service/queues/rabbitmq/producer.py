# -*- coding: utf-8 -*-
"""
@文件: producer.py
@说明: RabbitMQ 生产者（消息发布）
@时间: 2025-09-03

生产者用于向 RabbitMQ 发送消息，支持多种发送模式。

发送模式:
    - Simple: 简单模式，直接发送到队列
    - Work Queue: 工作队列，多个消费者竞争消费
    - Publish/Subscribe: 发布订阅，广播消息
    - Routing: 路由模式，根据 routing key 路由
    - Topics: 主题模式，支持通配符路由
    - RPC: 远程调用，请求/响应模式

使用示例:
    from queues.rabbitmq import RabbitMQProducer

    # 1. 简单发送
    producer = RabbitMQProducer()
    producer.send_to_queue('hello', 'Hello World!')

    # 2. 发布订阅
    producer.publish('logs', '', 'Log message')

    # 3. 路由模式
    producer.publish('direct_logs', 'error', 'Error message')

    # 4. 主题模式
    producer.publish('topic_logs', 'kernel.error', 'Kernel error')
"""

import json
import pickle
from typing import Any, Optional, Dict
import pika

from .client import rabbitmq_client
from loggers import logger


class RabbitMQProducer:
    """RabbitMQ 生产者

    提供向 RabbitMQ 发送消息的功能。

    属性:
        serializer: 消息序列化方式（json/pickle/str）

    方法:
        send_to_queue(): 发送消息到队列（简单模式）
        publish(): 发送消息到交换机
        send_json(): 发送 JSON 消息
        send_batch(): 批量发送消息
    """

    def __init__(self, serializer: str = 'json'):
        """初始化生产者

        Args:
            serializer: 序列化方式（json/pickle/str）
        """
        self.serializer = serializer
        logger.debug("RabbitMQ 生产者已初始化", serializer=serializer)

    def _serialize(self, message: Any) -> bytes:
        """序列化消息

        Args:
            message: 消息内容

        Returns:
            序列化后的字节数据
        """
        if self.serializer == 'json':
            return json.dumps(message, ensure_ascii=False).encode('utf-8')
        elif self.serializer == 'pickle':
            return pickle.dumps(message)
        elif self.serializer == 'str':
            return str(message).encode('utf-8')
        else:
            raise ValueError(f"不支持的序列化方式: {self.serializer}")

    def send_to_queue(
        self,
        queue: str,
        message: Any,
        durable: bool = True,
        delivery_mode: int = 2,
        priority: Optional[int] = None,
        expiration: Optional[str] = None
    ) -> bool:
        """发送消息到队列（简单模式）

        直接发送消息到指定队列，不使用交换机。

        Args:
            queue: 队列名称
            message: 消息内容
            durable: 队列是否持久化
            delivery_mode: 消息持久化模式（1=非持久化，2=持久化）
            priority: 消息优先级（0-255）
            expiration: 消息过期时间（毫秒）

        Returns:
            是否发送成功

        示例:
            >>> producer = RabbitMQProducer()
            >>> producer.send_to_queue('hello', 'Hello World!')

            >>> # 带优先级和过期时间
            >>> producer.send_to_queue(
            ...     'tasks',
            ...     {'task': 'send_email'},
            ...     priority=5,
            ...     expiration='60000'  # 60 秒后过期
            ... )
        """
        try:
            with rabbitmq_client.get_channel() as channel:
                # 声明队列
                rabbitmq_client.declare_queue(channel, queue, durable=durable)

                # 准备消息属性
                properties = pika.BasicProperties(
                    delivery_mode=delivery_mode,
                    priority=priority,
                    expiration=expiration
                )

                # 序列化消息
                body = self._serialize(message)

                # 发送消息
                channel.basic_publish(
                    exchange='',
                    routing_key=queue,
                    body=body,
                    properties=properties
                )

                logger.info(
                    "消息已发送到队列",
                    custom={"queue": queue, "size": len(body)}
                )

                return True

        except Exception as e:
            logger.error(
                "发送消息失败",
                category="error",
                event="rabbitmq_message_send_failed",
                custom={"queue": queue},
                error=e
            )
            return False

    def publish(
        self,
        exchange: str,
        routing_key: str,
        message: Any,
        exchange_type: str = 'direct',
        durable: bool = True,
        delivery_mode: int = 2,
        headers: Optional[Dict[str, Any]] = None
    ) -> bool:
        """发送消息到交换机

        通过交换机发送消息，支持多种路由模式。

        Args:
            exchange: 交换机名称
            routing_key: 路由键
            message: 消息内容
            exchange_type: 交换机类型（direct/topic/fanout/headers）
            durable: 是否持久化
            delivery_mode: 消息持久化模式（1=非持久化，2=持久化）
            headers: 消息头（用于 headers 类型交换机）

        Returns:
            是否发送成功

        示例:
            >>> producer = RabbitMQProducer()

            >>> # 发布订阅（fanout）
            >>> producer.publish(
            ...     'logs',
            ...     '',
            ...     'Log message',
            ...     exchange_type='fanout'
            ... )

            >>> # 路由模式（direct）
            >>> producer.publish(
            ...     'direct_logs',
            ...     'error',
            ...     'Error message',
            ...     exchange_type='direct'
            ... )

            >>> # 主题模式（topic）
            >>> producer.publish(
            ...     'topic_logs',
            ...     'kernel.error',
            ...     'Kernel error',
            ...     exchange_type='topic'
            ... )
        """
        try:
            with rabbitmq_client.get_channel() as channel:
                # 声明交换机
                rabbitmq_client.declare_exchange(
                    channel,
                    exchange,
                    exchange_type,
                    durable
                )

                # 准备消息属性
                properties = pika.BasicProperties(
                    delivery_mode=delivery_mode,
                    headers=headers
                )

                # 序列化消息
                body = self._serialize(message)

                # 发送消息
                channel.basic_publish(
                    exchange=exchange,
                    routing_key=routing_key,
                    body=body,
                    properties=properties
                )

                logger.info(
                    "消息已发布",
                    custom={"exchange": exchange, "routing_key": routing_key, "size": len(body)}
                )

                return True

        except Exception as e:
            logger.error(
                "发布消息失败",
                category="error",
                event="rabbitmq_message_publish_failed",
                custom={"exchange": exchange, "routing_key": routing_key},
                error=e
            )
            return False

    def send_json(
        self,
        queue: str,
        data: dict,
        **kwargs
    ) -> bool:
        """发送 JSON 消息

        便捷方法，自动序列化为 JSON 格式。

        Args:
            queue: 队列名称
            data: 字典数据
            **kwargs: 其他参数

        Returns:
            是否发送成功

        示例:
            >>> producer = RabbitMQProducer()
            >>> producer.send_json('tasks', {
            ...     'task': 'send_email',
            ...     'params': {
            ...         'to': 'user@example.com',
            ...         'subject': 'Hello'
            ...     }
            ... })
        """
        # 临时切换为 JSON 序列化
        original_serializer = self.serializer
        self.serializer = 'json'

        try:
            result = self.send_to_queue(queue, data, **kwargs)
            return result
        finally:
            self.serializer = original_serializer

    def send_batch(
        self,
        queue: str,
        messages: list,
        **kwargs
    ) -> int:
        """批量发送消息

        Args:
            queue: 队列名称
            messages: 消息列表
            **kwargs: 其他参数

        Returns:
            成功发送的消息数量

        示例:
            >>> producer = RabbitMQProducer()
            >>> messages = [
            ...     {'id': 1, 'text': 'Message 1'},
            ...     {'id': 2, 'text': 'Message 2'},
            ...     {'id': 3, 'text': 'Message 3'},
            ... ]
            >>> count = producer.send_batch('tasks', messages)
            >>> print(f"发送了 {count} 条消息")
        """
        success_count = 0

        try:
            with rabbitmq_client.get_channel() as channel:
                # 声明队列
                rabbitmq_client.declare_queue(
                    channel,
                    queue,
                    durable=kwargs.get('durable', True)
                )

                # 准备消息属性
                properties = pika.BasicProperties(
                    delivery_mode=kwargs.get('delivery_mode', 2)
                )

                # 批量发送
                for message in messages:
                    try:
                        body = self._serialize(message)
                        channel.basic_publish(
                            exchange='',
                            routing_key=queue,
                            body=body,
                            properties=properties
                        )
                        success_count += 1
                    except Exception as e:
                        logger.error(
                            "批量发送中某条消息失败",
                            category="error",
                            event="rabbitmq_batch_send_item_failed",
                            error=e
                        )

                logger.info(
                    "批量发送完成",
                    custom={"queue": queue, "total": len(messages), "success": success_count}
                )

        except Exception as e:
            logger.error("批量发送失败", category="error", event="rabbitmq_batch_send_failed", custom={"queue": queue}, error=e)

        return success_count

    def send_delayed_message(
        self,
        queue: str,
        message: Any,
        delay_ms: int,
        **kwargs
    ) -> bool:
        """发送延迟消息

        使用消息 TTL + 死信队列实现延迟消息。

        Args:
            queue: 目标队列名称
            message: 消息内容
            delay_ms: 延迟时间（毫秒）
            **kwargs: 其他参数

        Returns:
            是否发送成功

        注意:
            需要预先配置死信队列和延迟队列。

        示例:
            >>> producer = RabbitMQProducer()
            >>> # 10 秒后发送消息
            >>> producer.send_delayed_message(
            ...     'tasks',
            ...     {'task': 'reminder'},
            ...     delay_ms=10000
            ... )
        """
        try:
            with rabbitmq_client.get_channel() as channel:
                # 延迟队列名称
                delay_queue = f"{queue}.delay"

                # 声明延迟队列（带死信交换机配置）
                channel.queue_declare(
                    queue=delay_queue,
                    durable=True,
                    arguments={
                        'x-dead-letter-exchange': '',
                        'x-dead-letter-routing-key': queue,
                        'x-message-ttl': delay_ms
                    }
                )

                # 声明目标队列
                rabbitmq_client.declare_queue(channel, queue, durable=True)

                # 发送到延迟队列
                body = self._serialize(message)
                channel.basic_publish(
                    exchange='',
                    routing_key=delay_queue,
                    body=body,
                    properties=pika.BasicProperties(delivery_mode=2)
                )

                logger.info(
                    "延迟消息已发送",
                    custom={"queue": queue, "delay_ms": delay_ms}
                )

                return True

        except Exception as e:
            logger.error(
                "发送延迟消息失败",
                category="error",
                event="rabbitmq_delayed_message_failed",
                custom={"queue": queue},
                error=e
            )
            return False
