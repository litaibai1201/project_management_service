# -*- coding: utf-8 -*-
"""
@文件: consumer.py
@说明: RabbitMQ 消费者（消息接收）
@时间: 2025-09-03

消费者用于从 RabbitMQ 接收并处理消息，支持多种消费模式。

消费模式:
    - Simple: 简单模式，从队列接收消息
    - Work Queue: 工作队列，多个消费者竞争消费
    - Publish/Subscribe: 订阅模式，接收广播消息
    - Routing: 路由模式，根据 routing key 接收
    - Topics: 主题模式，支持通配符订阅

使用示例:
    from queues.rabbitmq import RabbitMQConsumer

    # 1. 定义回调函数
    def callback(channel, method, properties, body):
        print(f"Received: {body}")
        channel.basic_ack(delivery_tag=method.delivery_tag)

    # 2. 创建消费者并开始消费
    consumer = RabbitMQConsumer()
    consumer.consume('hello', callback)
"""

import json
import pickle
from typing import Callable, Optional, List
import pika

from .client import rabbitmq_client
from loggers import logger


class RabbitMQConsumer:
    """RabbitMQ 消费者

    提供从 RabbitMQ 接收消息的功能。

    属性:
        serializer: 消息反序列化方式（json/pickle/str）
        prefetch_count: 预取消息数量

    方法:
        consume(): 消费队列消息
        subscribe(): 订阅交换机消息
        get_one(): 获取单条消息
        start_consuming(): 开始消费（阻塞）
    """

    def __init__(
        self,
        serializer: str = 'json',
        prefetch_count: int = 1
    ):
        """初始化消费者

        Args:
            serializer: 反序列化方式（json/pickle/str）
            prefetch_count: 预取消息数量（QoS）
        """
        self.serializer = serializer
        self.prefetch_count = prefetch_count
        logger.debug(
            "RabbitMQ 消费者已初始化",
            serializer=serializer,
            prefetch_count=prefetch_count
        )

    def _deserialize(self, body: bytes):
        """反序列化消息

        Args:
            body: 消息字节数据

        Returns:
            反序列化后的消息
        """
        if self.serializer == 'json':
            return json.loads(body.decode('utf-8'))
        elif self.serializer == 'pickle':
            return pickle.loads(body)
        elif self.serializer == 'str':
            return body.decode('utf-8')
        else:
            raise ValueError(f"不支持的反序列化方式: {self.serializer}")

    def consume(
        self,
        queue: str,
        callback: Callable,
        auto_ack: bool = False,
        durable: bool = True,
        exclusive: bool = False
    ) -> None:
        """消费队列消息（简单模式/工作队列）

        Args:
            queue: 队列名称
            callback: 回调函数
            auto_ack: 是否自动确认
            durable: 队列是否持久化
            exclusive: 是否独占队列

        回调函数签名:
            def callback(channel, method, properties, body):
                # 处理消息
                channel.basic_ack(delivery_tag=method.delivery_tag)

        示例:
            >>> def handle_message(channel, method, properties, body):
            ...     print(f"Received: {body}")
            ...     # 手动确认
            ...     channel.basic_ack(delivery_tag=method.delivery_tag)
            >>>
            >>> consumer = RabbitMQConsumer()
            >>> consumer.consume('hello', handle_message)
        """
        try:
            connection = rabbitmq_client.get_connection()
            channel = connection.channel()

            # 设置 QoS
            channel.basic_qos(prefetch_count=self.prefetch_count)

            # 声明队列
            rabbitmq_client.declare_queue(
                channel,
                queue,
                durable=durable,
                exclusive=exclusive
            )

            # 开始消费
            channel.basic_consume(
                queue=queue,
                on_message_callback=callback,
                auto_ack=auto_ack
            )

            logger.info("开始消费队列", custom={"queue": queue})
            channel.start_consuming()

        except KeyboardInterrupt:
            logger.info("消费者已停止（用户中断）")
            channel.stop_consuming()
        except Exception as e:
            logger.error("消费失败", category="error", event="rabbitmq_consume_failed", custom={"queue": queue}, error=e)
            raise

    def subscribe(
        self,
        exchange: str,
        routing_keys: List[str],
        callback: Callable,
        exchange_type: str = 'direct',
        auto_ack: bool = False,
        queue_name: str = ''
    ) -> None:
        """订阅交换机消息

        Args:
            exchange: 交换机名称
            routing_keys: 路由键列表（topic 支持通配符：* 和 #）
            callback: 回调函数
            exchange_type: 交换机类型
            auto_ack: 是否自动确认
            queue_name: 队列名称（空字符串表示自动生成）

        示例:
            >>> def handle_log(channel, method, properties, body):
            ...     print(f"Log: {body}")
            ...     channel.basic_ack(delivery_tag=method.delivery_tag)
            >>>
            >>> consumer = RabbitMQConsumer()
            >>>
            >>> # 发布订阅（fanout，接收所有消息）
            >>> consumer.subscribe('logs', [''], handle_log, 'fanout')
            >>>
            >>> # 路由模式（direct，只接收特定路由键）
            >>> consumer.subscribe(
            ...     'direct_logs',
            ...     ['error', 'warning'],
            ...     handle_log,
            ...     'direct'
            ... )
            >>>
            >>> # 主题模式（topic，支持通配符）
            >>> consumer.subscribe(
            ...     'topic_logs',
            ...     ['kernel.*', '*.error'],
            ...     handle_log,
            ...     'topic'
            ... )
        """
        try:
            connection = rabbitmq_client.get_connection()
            channel = connection.channel()

            # 设置 QoS
            channel.basic_qos(prefetch_count=self.prefetch_count)

            # 声明交换机
            rabbitmq_client.declare_exchange(
                channel,
                exchange,
                exchange_type
            )

            # 声明队列（自动生成或指定）
            result = rabbitmq_client.declare_queue(
                channel,
                queue_name,
                durable=False,
                exclusive=True,
                auto_delete=True
            )
            queue = result.method.queue

            # 绑定队列到交换机（多个路由键）
            for routing_key in routing_keys:
                rabbitmq_client.bind_queue(
                    channel,
                    queue,
                    exchange,
                    routing_key
                )

            # 开始消费
            channel.basic_consume(
                queue=queue,
                on_message_callback=callback,
                auto_ack=auto_ack
            )

            logger.info(
                "开始订阅交换机",
                custom={"exchange": exchange, "routing_keys": routing_keys}
            )
            channel.start_consuming()

        except KeyboardInterrupt:
            logger.info("订阅者已停止（用户中断）")
            channel.stop_consuming()
        except Exception as e:
            logger.error(
                "订阅失败",
                category="error",
                event="rabbitmq_subscribe_failed",
                custom={"exchange": exchange},
                error=e
            )
            raise

    def get_one(
        self,
        queue: str,
        auto_ack: bool = True
    ) -> Optional[tuple]:
        """获取单条消息（非阻塞）

        Args:
            queue: 队列名称
            auto_ack: 是否自动确认

        Returns:
            (method, properties, body) 或 None

        示例:
            >>> consumer = RabbitMQConsumer()
            >>> result = consumer.get_one('hello')
            >>> if result:
            ...     method, properties, body = result
            ...     print(f"Received: {body}")
        """
        try:
            with rabbitmq_client.get_channel() as channel:
                # 声明队列
                rabbitmq_client.declare_queue(channel, queue)

                # 获取一条消息
                method, properties, body = channel.basic_get(
                    queue=queue,
                    auto_ack=auto_ack
                )

                if method:
                    logger.debug("获取到消息", custom={"queue": queue})
                    return (method, properties, body)
                else:
                    logger.debug("队列为空", custom={"queue": queue})
                    return None

        except Exception as e:
            logger.error("获取消息失败", category="error", event="rabbitmq_message_get_failed", custom={"queue": queue}, error=e)
            return None

    def create_worker(
        self,
        queue: str,
        handler: Callable[[any], bool],
        durable: bool = True,
        auto_ack: bool = False
    ) -> None:
        """创建工作队列消费者

        便捷方法，自动处理消息确认和错误处理。

        Args:
            queue: 队列名称
            handler: 消息处理函数（接收消息，返回是否成功）
            durable: 队列是否持久化
            auto_ack: 是否自动确认

        Handler 函数签名:
            def handler(message: any) -> bool:
                # 处理消息
                return True  # 成功返回 True，失败返回 False

        示例:
            >>> def process_task(message):
            ...     try:
            ...         print(f"Processing: {message}")
            ...         # 处理逻辑
            ...         return True
            ...     except Exception:
            ...         return False
            >>>
            >>> consumer = RabbitMQConsumer(serializer='json')
            >>> consumer.create_worker('tasks', process_task)
        """
        def callback(channel, method, properties, body):
            try:
                # 反序列化消息
                message = self._deserialize(body)

                logger.info("开始处理消息", custom={"queue": queue})

                # 调用处理函数
                success = handler(message)

                # 根据处理结果确认或拒绝
                if success:
                    channel.basic_ack(delivery_tag=method.delivery_tag)
                    logger.info("消息处理成功", custom={"queue": queue})
                else:
                    # 重新入队
                    channel.basic_nack(
                        delivery_tag=method.delivery_tag,
                        requeue=True
                    )
                    logger.warning("消息处理失败，重新入队", custom={"queue": queue})

            except Exception as e:
                logger.error(
                    "消息处理异常",
                    category="error",
                    event="rabbitmq_message_process_failed",
                    custom={"queue": queue},
                    error=e
                )
                # 重新入队
                channel.basic_nack(
                    delivery_tag=method.delivery_tag,
                    requeue=True
                )

        # 开始消费
        self.consume(queue, callback, auto_ack=auto_ack, durable=durable)

    def ack_message(
        self,
        channel: pika.channel.Channel,
        delivery_tag: int
    ) -> None:
        """手动确认消息

        Args:
            channel: RabbitMQ 信道
            delivery_tag: 消息标签
        """
        channel.basic_ack(delivery_tag=delivery_tag)
        logger.debug("消息已确认", custom={"delivery_tag": delivery_tag})

    def nack_message(
        self,
        channel: pika.channel.Channel,
        delivery_tag: int,
        requeue: bool = True
    ) -> None:
        """拒绝消息

        Args:
            channel: RabbitMQ 信道
            delivery_tag: 消息标签
            requeue: 是否重新入队
        """
        channel.basic_nack(delivery_tag=delivery_tag, requeue=requeue)
        logger.debug(
            "消息已拒绝",
            custom={"delivery_tag": delivery_tag, "requeue": requeue}
        )

    def reject_message(
        self,
        channel: pika.channel.Channel,
        delivery_tag: int,
        requeue: bool = False
    ) -> None:
        """拒绝单条消息

        Args:
            channel: RabbitMQ 信道
            delivery_tag: 消息标签
            requeue: 是否重新入队
        """
        channel.basic_reject(delivery_tag=delivery_tag, requeue=requeue)
        logger.debug(
            "消息已拒绝（reject）",
            custom={"delivery_tag": delivery_tag, "requeue": requeue}
        )
