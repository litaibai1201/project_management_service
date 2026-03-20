# -*- coding: utf-8 -*-
"""
@文件: client.py
@说明: RabbitMQ 客户端管理器
@时间: 2025-09-03

RabbitMQ 是一个开源的消息代理和队列服务器，用于应用间的异步通信。

核心概念:
    - Connection: 连接，TCP 连接
    - Channel: 信道，逻辑连接，复用 TCP 连接
    - Exchange: 交换机，接收消息并路由到队列
    - Queue: 队列，存储消息
    - Binding: 绑定，Exchange 和 Queue 的关系
    - Routing Key: 路由键，用于消息路由

Exchange 类型:
    - direct: 直连交换机，精确匹配 routing key
    - topic: 主题交换机，支持通配符（* 匹配一个词，# 匹配多个词）
    - fanout: 扇出交换机，广播消息到所有绑定的队列
    - headers: 头交换机，根据消息头属性路由

配置项:
    RABBITMQ_HOST: RabbitMQ 服务器地址
    RABBITMQ_PORT: RabbitMQ 端口
    RABBITMQ_USERNAME: 用户名
    RABBITMQ_PASSWORD: 密码
    RABBITMQ_VIRTUAL_HOST: 虚拟主机

使用示例:
    from rabbitmq import rabbitmq_client

    # 在 app.py 中初始化
    rabbitmq_client.init_app(app)

    # 获取连接
    connection = rabbitmq_client.get_connection()
"""

import os
import pika
from typing import Optional, Dict, Any
from contextlib import contextmanager

from loggers import logger


class RabbitMQClientManager:
    """RabbitMQ 客户端管理器

    提供 RabbitMQ 连接管理和基础操作。

    配置项:
        RABBITMQ_HOST: 服务器地址
        RABBITMQ_PORT: 端口（默认 5672）
        RABBITMQ_USERNAME: 用户名（默认 guest）
        RABBITMQ_PASSWORD: 密码（默认 guest）
        RABBITMQ_VIRTUAL_HOST: 虚拟主机（默认 /）

    属性:
        connection: RabbitMQ 连接实例

    方法:
        init_app(app): Flask 应用初始化
        get_connection(): 获取连接
        get_channel(): 获取信道
        close(): 关闭连接
    """

    def __init__(self):
        """初始化 RabbitMQ 客户端管理器"""
        self._connection: Optional[pika.BlockingConnection] = None
        self._connection_params: Optional[pika.ConnectionParameters] = None
        logger.info("RabbitMQ 客户端管理器已初始化")

    @property
    def connection(self) -> pika.BlockingConnection:
        """获取 RabbitMQ 连接实例

        Returns:
            RabbitMQ 连接实例

        Raises:
            RuntimeError: 如果 RabbitMQ 未初始化
        """
        if self._connection_params is None:
            raise RuntimeError(
                "RabbitMQ 未初始化，请先调用 init_app() 方法"
            )

        # 如果连接不存在或已关闭，创建新连接
        if self._connection is None or self._connection.is_closed:
            self._connection = pika.BlockingConnection(self._connection_params)
            logger.info("RabbitMQ 连接已建立")

        return self._connection

    def init_app(self, app) -> None:
        """Flask 应用初始化

        Args:
            app: Flask 应用实例

        配置优先级: 环境变量 > .env 配置 > 默认值
        """
        try:
            # 获取配置
            host = (
                app.config.get("RABBITMQ_HOST")
                or os.environ.get("RABBITMQ_HOST")
                or "127.0.0.1"
            )

            port = int(
                app.config.get("RABBITMQ_PORT")
                or os.environ.get("RABBITMQ_PORT")
                or 5672
            )

            username = (
                app.config.get("RABBITMQ_USERNAME")
                or os.environ.get("RABBITMQ_USERNAME")
                or "guest"
            )

            password = (
                app.config.get("RABBITMQ_PASSWORD")
                or os.environ.get("RABBITMQ_PASSWORD")
                or "guest"
            )

            virtual_host = (
                app.config.get("RABBITMQ_VIRTUAL_HOST")
                or os.environ.get("RABBITMQ_VIRTUAL_HOST")
                or "/"
            )

            # 连接超时配置
            connection_timeout = int(
                app.config.get("RABBITMQ_CONNECTION_TIMEOUT")
                or os.environ.get("RABBITMQ_CONNECTION_TIMEOUT")
                or 10
            )

            # 心跳超时配置
            heartbeat = int(
                app.config.get("RABBITMQ_HEARTBEAT")
                or os.environ.get("RABBITMQ_HEARTBEAT")
                or 600
            )

            # 创建认证凭据
            credentials = pika.PlainCredentials(username, password)

            # 创建连接参数
            self._connection_params = pika.ConnectionParameters(
                host=host,
                port=port,
                virtual_host=virtual_host,
                credentials=credentials,
                connection_attempts=3,
                retry_delay=2,
                socket_timeout=connection_timeout,
                heartbeat=heartbeat,
            )

            # 将 RabbitMQ 客户端绑定到 Flask app
            app.extensions = getattr(app, 'extensions', {})
            app.extensions['rabbitmq'] = self

            logger.info(
                "RabbitMQ 初始化成功",
                custom={"host": host, "port": port, "virtual_host": virtual_host, "username": username},
            )

        except Exception as e:
            logger.error("RabbitMQ 初始化失败", category="error", event="rabbitmq_init_failed", error=e)
            raise

    def get_connection(self) -> pika.BlockingConnection:
        """获取 RabbitMQ 连接

        Returns:
            RabbitMQ 连接实例

        示例:
            >>> from rabbitmq import rabbitmq_client
            >>> connection = rabbitmq_client.get_connection()
        """
        return self.connection

    @contextmanager
    def get_channel(self):
        """获取 RabbitMQ 信道（上下文管理器）

        Yields:
            RabbitMQ 信道实例

        示例:
            >>> from rabbitmq import rabbitmq_client
            >>> with rabbitmq_client.get_channel() as channel:
            ...     channel.basic_publish(
            ...         exchange='',
            ...         routing_key='hello',
            ...         body='Hello World!'
            ...     )
        """
        channel = None
        try:
            channel = self.connection.channel()
            logger.debug("RabbitMQ 信道已创建")
            yield channel
        except Exception as e:
            logger.error("RabbitMQ 信道操作失败", category="error", event="rabbitmq_channel_failed", error=e)
            raise
        finally:
            if channel and channel.is_open:
                channel.close()
                logger.debug("RabbitMQ 信道已关闭")

    def declare_exchange(
        self,
        channel: pika.channel.Channel,
        exchange: str,
        exchange_type: str = 'direct',
        durable: bool = True,
        auto_delete: bool = False
    ) -> None:
        """声明交换机

        Args:
            channel: RabbitMQ 信道
            exchange: 交换机名称
            exchange_type: 交换机类型（direct/topic/fanout/headers）
            durable: 是否持久化
            auto_delete: 是否自动删除

        示例:
            >>> with rabbitmq_client.get_channel() as channel:
            ...     rabbitmq_client.declare_exchange(
            ...         channel, 'logs', 'fanout'
            ...     )
        """
        try:
            channel.exchange_declare(
                exchange=exchange,
                exchange_type=exchange_type,
                durable=durable,
                auto_delete=auto_delete
            )
            logger.info(
                "交换机声明成功",
                custom={"exchange": exchange, "type": exchange_type}
            )
        except Exception as e:
            logger.error("交换机声明失败", category="error", event="rabbitmq_exchange_declare_failed", custom={"exchange": exchange}, error=e)
            raise

    def declare_queue(
        self,
        channel: pika.channel.Channel,
        queue: str,
        durable: bool = True,
        exclusive: bool = False,
        auto_delete: bool = False,
        arguments: Optional[Dict[str, Any]] = None
    ) -> pika.frame.Method:
        """声明队列

        Args:
            channel: RabbitMQ 信道
            queue: 队列名称（空字符串表示自动生成）
            durable: 是否持久化
            exclusive: 是否独占
            auto_delete: 是否自动删除
            arguments: 其他参数（如消息 TTL、死信队列等）

        Returns:
            队列声明结果

        示例:
            >>> with rabbitmq_client.get_channel() as channel:
            ...     result = rabbitmq_client.declare_queue(
            ...         channel, 'task_queue'
            ...     )
            ...     print(result.method.queue)
        """
        try:
            result = channel.queue_declare(
                queue=queue,
                durable=durable,
                exclusive=exclusive,
                auto_delete=auto_delete,
                arguments=arguments
            )
            logger.info("队列声明成功", custom={"queue": queue or result.method.queue})
            return result
        except Exception as e:
            logger.error("队列声明失败", category="error", event="rabbitmq_queue_declare_failed", custom={"queue": queue}, error=e)
            raise

    def bind_queue(
        self,
        channel: pika.channel.Channel,
        queue: str,
        exchange: str,
        routing_key: str = ''
    ) -> None:
        """绑定队列到交换机

        Args:
            channel: RabbitMQ 信道
            queue: 队列名称
            exchange: 交换机名称
            routing_key: 路由键

        示例:
            >>> with rabbitmq_client.get_channel() as channel:
            ...     rabbitmq_client.bind_queue(
            ...         channel,
            ...         queue='email_queue',
            ...         exchange='tasks',
            ...         routing_key='email.*'
            ...     )
        """
        try:
            channel.queue_bind(
                queue=queue,
                exchange=exchange,
                routing_key=routing_key
            )
            logger.info(
                "队列绑定成功",
                custom={"queue": queue, "exchange": exchange, "routing_key": routing_key}
            )
        except Exception as e:
            logger.error(
                "队列绑定失败",
                category="error",
                event="rabbitmq_queue_bind_failed",
                custom={"queue": queue, "exchange": exchange},
                error=e
            )
            raise

    def purge_queue(self, channel: pika.channel.Channel, queue: str) -> int:
        """清空队列中的所有消息

        Args:
            channel: RabbitMQ 信道
            queue: 队列名称

        Returns:
            被清空的消息数量

        警告:
            此操作会删除队列中的所有消息，请谨慎使用！
        """
        try:
            result = channel.queue_purge(queue=queue)
            logger.warning("队列已清空", custom={"queue": queue, "message_count": result.method.message_count})
            return result.method.message_count
        except Exception as e:
            logger.error("清空队列失败", category="error", event="rabbitmq_queue_purge_failed", custom={"queue": queue}, error=e)
            raise

    def delete_queue(self, channel: pika.channel.Channel, queue: str) -> None:
        """删除队列

        Args:
            channel: RabbitMQ 信道
            queue: 队列名称

        警告:
            此操作会删除整个队列，请谨慎使用！
        """
        try:
            channel.queue_delete(queue=queue)
            logger.warning("队列已删除", custom={"queue": queue})
        except Exception as e:
            logger.error("删除队列失败", category="error", event="rabbitmq_queue_delete_failed", custom={"queue": queue}, error=e)
            raise

    def get_queue_size(self, channel: pika.channel.Channel, queue: str) -> int:
        """获取队列中的消息数量

        Args:
            channel: RabbitMQ 信道
            queue: 队列名称

        Returns:
            队列中的消息数量
        """
        try:
            result = channel.queue_declare(queue=queue, passive=True)
            return result.method.message_count
        except Exception as e:
            logger.error("获取队列大小失败", category="error", event="rabbitmq_queue_size_failed", custom={"queue": queue}, error=e)
            raise

    def close(self) -> None:
        """关闭 RabbitMQ 连接

        示例:
            >>> from rabbitmq import rabbitmq_client
            >>> rabbitmq_client.close()
        """
        if self._connection and not self._connection.is_closed:
            self._connection.close()
            logger.info("RabbitMQ 连接已关闭")

    def __del__(self):
        """析构函数，确保连接关闭"""
        self.close()


# 创建全局实例
rabbitmq_client = RabbitMQClientManager()
