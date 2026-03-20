# -*- coding: utf-8 -*-
"""
@文件: test_queue_rabbitmq.py
@说明: RabbitMQProducer / RabbitMQConsumer 单元测试（使用 Mock 替代真实 RabbitMQ）
@时间: 2026-03-09

运行: python -m pytest tests/test_queue_rabbitmq.py -v
"""
import os
import sys
import json
import pickle
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch, call

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

# Mock pika before importing any module that depends on it
for _mod in ["pika", "pika.exceptions", "pika.spec", "pika.connection", "pika.channel"]:
    sys.modules.setdefault(_mod, MagicMock())


@contextmanager
def mock_rabbitmq_client():
    """Patch rabbitmq_client 的 get_channel / get_connection"""
    mock_channel = MagicMock()
    mock_connection = MagicMock()
    mock_connection.channel.return_value = mock_channel

    mock_client = MagicMock()
    mock_client.get_channel.return_value.__enter__ = lambda s: mock_channel
    mock_client.get_channel.return_value.__exit__ = MagicMock(return_value=False)
    mock_client.get_connection.return_value = mock_connection
    mock_client.declare_queue.return_value = MagicMock(method=MagicMock(queue="auto_queue"))
    mock_client.declare_exchange.return_value = None
    mock_client.bind_queue.return_value = None

    with patch("queues.rabbitmq.producer.rabbitmq_client", mock_client), \
         patch("queues.rabbitmq.consumer.rabbitmq_client", mock_client):
        yield mock_client, mock_channel


# ============================= Producer 测试 ==============================

class TestRabbitMQProducerSerialize(unittest.TestCase):
    """RabbitMQProducer._serialize() 序列化测试"""

    def setUp(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        self.ProducerClass = RabbitMQProducer

    def test_serialize_json_dict(self):
        p = self.ProducerClass(serializer="json")
        result = p._serialize({"key": "value", "num": 42})
        parsed = json.loads(result.decode("utf-8"))
        self.assertEqual(parsed["key"], "value")
        self.assertEqual(parsed["num"], 42)

    def test_serialize_json_string(self):
        p = self.ProducerClass(serializer="json")
        result = p._serialize("hello")
        self.assertEqual(json.loads(result), "hello")

    def test_serialize_json_list(self):
        p = self.ProducerClass(serializer="json")
        result = p._serialize([1, 2, 3])
        self.assertEqual(json.loads(result), [1, 2, 3])

    def test_serialize_pickle(self):
        p = self.ProducerClass(serializer="pickle")
        data = {"complex": [1, 2, 3]}
        result = p._serialize(data)
        self.assertEqual(pickle.loads(result), data)

    def test_serialize_str(self):
        p = self.ProducerClass(serializer="str")
        result = p._serialize({"x": 1})
        self.assertIsInstance(result, bytes)
        self.assertIn("x", result.decode("utf-8"))

    def test_serialize_invalid_raises_value_error(self):
        p = self.ProducerClass(serializer="invalid")
        with self.assertRaises(ValueError):
            p._serialize("test")


class TestRabbitMQProducerSendToQueue(unittest.TestCase):
    """RabbitMQProducer.send_to_queue() 测试"""

    def test_send_to_queue_success(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.send_to_queue("test_queue", {"msg": "hello"})
            self.assertTrue(result)
            mock_channel.basic_publish.assert_called_once()
            publish_kwargs = mock_channel.basic_publish.call_args[1]
            self.assertEqual(publish_kwargs["exchange"], "")
            self.assertEqual(publish_kwargs["routing_key"], "test_queue")

    def test_send_to_queue_with_priority(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.send_to_queue("test_queue", "msg", priority=5)
            self.assertTrue(result)

    def test_send_to_queue_with_expiration(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.send_to_queue("test_queue", "msg", expiration="60000")
            self.assertTrue(result)

    def test_send_to_queue_returns_false_on_error(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_client.get_channel.return_value.__enter__ = MagicMock(
                side_effect=Exception("connection error")
            )
            p = RabbitMQProducer()
            result = p.send_to_queue("test_queue", "msg")
            self.assertFalse(result)

    def test_send_to_queue_declares_queue(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            p.send_to_queue("test_queue", "msg", durable=True)
            mock_client.declare_queue.assert_called_once_with(
                mock_channel, "test_queue", durable=True
            )


class TestRabbitMQProducerPublish(unittest.TestCase):
    """RabbitMQProducer.publish() 测试"""

    def test_publish_success(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.publish("logs", "error", "Error occurred", exchange_type="direct")
            self.assertTrue(result)
            mock_channel.basic_publish.assert_called_once()
            publish_kwargs = mock_channel.basic_publish.call_args[1]
            self.assertEqual(publish_kwargs["exchange"], "logs")
            self.assertEqual(publish_kwargs["routing_key"], "error")

    def test_publish_declares_exchange(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            p.publish("logs", "info", "msg", exchange_type="fanout")
            mock_client.declare_exchange.assert_called_once_with(
                mock_channel, "logs", "fanout", True
            )

    def test_publish_returns_false_on_error(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_client.get_channel.return_value.__enter__ = MagicMock(
                side_effect=Exception("publish error")
            )
            p = RabbitMQProducer()
            result = p.publish("logs", "error", "msg")
            self.assertFalse(result)

    def test_publish_with_headers(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.publish("ex", "key", "msg", headers={"x-version": "1.0"})
            self.assertTrue(result)


class TestRabbitMQProducerSendJson(unittest.TestCase):
    """RabbitMQProducer.send_json() 测试"""

    def test_send_json_uses_json_serializer(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer(serializer="pickle")
            result = p.send_json("queue", {"key": "value"})
            self.assertTrue(result)
            # 发送后 serializer 还原为原来的 pickle
            self.assertEqual(p.serializer, "pickle")

    def test_send_json_body_is_valid_json(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            p.send_json("queue", {"task": "email", "to": "user@example.com"})
            body = mock_channel.basic_publish.call_args[1]["body"]
            parsed = json.loads(body.decode("utf-8"))
            self.assertEqual(parsed["task"], "email")


class TestRabbitMQProducerSendBatch(unittest.TestCase):
    """RabbitMQProducer.send_batch() 测试"""

    def test_send_batch_returns_success_count(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            messages = [{"id": i} for i in range(5)]
            count = p.send_batch("queue", messages)
            self.assertEqual(count, 5)
            self.assertEqual(mock_channel.basic_publish.call_count, 5)

    def test_send_batch_partial_failure(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            # 第3次 basic_publish 失败
            call_count = [0]
            def side_effect(**kwargs):
                call_count[0] += 1
                if call_count[0] == 2:
                    raise Exception("publish error")

            mock_channel.basic_publish.side_effect = side_effect

            p = RabbitMQProducer()
            messages = [{"id": i} for i in range(3)]
            count = p.send_batch("queue", messages)
            # 成功 2 条（第 1 和第 3），第 2 条失败
            self.assertEqual(count, 2)

    def test_send_batch_returns_zero_on_channel_error(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_client.get_channel.return_value.__enter__ = MagicMock(
                side_effect=Exception("channel error")
            )
            p = RabbitMQProducer()
            count = p.send_batch("queue", [{"id": 1}, {"id": 2}])
            self.assertEqual(count, 0)


class TestRabbitMQProducerSendDelayed(unittest.TestCase):
    """RabbitMQProducer.send_delayed_message() 测试"""

    def test_send_delayed_message_success(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            p = RabbitMQProducer()
            result = p.send_delayed_message("tasks", {"task": "reminder"}, delay_ms=10000)
            self.assertTrue(result)
            # 声明延迟队列
            mock_channel.queue_declare.assert_called_once()
            args = mock_channel.queue_declare.call_args[1]
            self.assertEqual(args["queue"], "tasks.delay")
            self.assertEqual(args["arguments"]["x-message-ttl"], 10000)
            # 发送到延迟队列
            self.assertEqual(mock_channel.basic_publish.call_args[1]["routing_key"], "tasks.delay")

    def test_send_delayed_message_returns_false_on_error(self):
        from queues.rabbitmq.producer import RabbitMQProducer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_client.get_channel.return_value.__enter__ = MagicMock(
                side_effect=Exception("error")
            )
            p = RabbitMQProducer()
            result = p.send_delayed_message("tasks", "msg", delay_ms=5000)
            self.assertFalse(result)


# ============================= Consumer 测试 ==============================

class TestRabbitMQConsumerDeserialize(unittest.TestCase):
    """RabbitMQConsumer._deserialize() 反序列化测试"""

    def setUp(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        self.ConsumerClass = RabbitMQConsumer

    def test_deserialize_json(self):
        c = self.ConsumerClass(serializer="json")
        body = json.dumps({"key": "value"}).encode("utf-8")
        result = c._deserialize(body)
        self.assertEqual(result["key"], "value")

    def test_deserialize_pickle(self):
        c = self.ConsumerClass(serializer="pickle")
        data = {"complex": [1, 2, 3]}
        body = pickle.dumps(data)
        result = c._deserialize(body)
        self.assertEqual(result, data)

    def test_deserialize_str(self):
        c = self.ConsumerClass(serializer="str")
        body = "hello world".encode("utf-8")
        result = c._deserialize(body)
        self.assertEqual(result, "hello world")

    def test_deserialize_invalid_raises_value_error(self):
        c = self.ConsumerClass(serializer="invalid")
        with self.assertRaises(ValueError):
            c._deserialize(b"data")


class TestRabbitMQConsumerGetOne(unittest.TestCase):
    """RabbitMQConsumer.get_one() 测试"""

    def test_get_one_returns_tuple_when_message_exists(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_method = MagicMock()
            mock_props = MagicMock()
            mock_body = b'{"data": "test"}'
            mock_channel.basic_get.return_value = (mock_method, mock_props, mock_body)

            c = RabbitMQConsumer()
            result = c.get_one("test_queue")
            self.assertIsNotNone(result)
            self.assertEqual(len(result), 3)
            self.assertEqual(result[2], mock_body)

    def test_get_one_returns_none_when_queue_empty(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_channel.basic_get.return_value = (None, None, None)

            c = RabbitMQConsumer()
            result = c.get_one("empty_queue")
            self.assertIsNone(result)

    def test_get_one_returns_none_on_error(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        with mock_rabbitmq_client() as (mock_client, mock_channel):
            mock_client.get_channel.return_value.__enter__ = MagicMock(
                side_effect=Exception("connection error")
            )
            c = RabbitMQConsumer()
            result = c.get_one("test_queue")
            self.assertIsNone(result)


class TestRabbitMQConsumerAckNack(unittest.TestCase):
    """ack_message / nack_message / reject_message 测试"""

    def test_ack_message(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer()
        mock_channel = MagicMock()
        c.ack_message(mock_channel, delivery_tag=42)
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=42)

    def test_nack_message_with_requeue(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer()
        mock_channel = MagicMock()
        c.nack_message(mock_channel, delivery_tag=42, requeue=True)
        mock_channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=True)

    def test_nack_message_without_requeue(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer()
        mock_channel = MagicMock()
        c.nack_message(mock_channel, delivery_tag=7, requeue=False)
        mock_channel.basic_nack.assert_called_once_with(delivery_tag=7, requeue=False)

    def test_reject_message_default_no_requeue(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer()
        mock_channel = MagicMock()
        c.reject_message(mock_channel, delivery_tag=99)
        mock_channel.basic_reject.assert_called_once_with(delivery_tag=99, requeue=False)

    def test_reject_message_with_requeue(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer()
        mock_channel = MagicMock()
        c.reject_message(mock_channel, delivery_tag=99, requeue=True)
        mock_channel.basic_reject.assert_called_once_with(delivery_tag=99, requeue=True)


class TestRabbitMQConsumerCreateWorker(unittest.TestCase):
    """create_worker() 的 callback 逻辑测试"""

    def _get_callback(self, consumer, queue, handler):
        """获取 create_worker 内部生成的 callback 函数"""
        # create_worker 调用 self.consume()，consume 用到真实 RabbitMQ，
        # 我们直接提取其内部 callback 逻辑
        captured_callback = []

        def fake_consume(q, cb, **kwargs):
            captured_callback.append(cb)

        from unittest.mock import patch as _patch
        with _patch.object(consumer, "consume", side_effect=fake_consume):
            consumer.create_worker(queue, handler)

        return captured_callback[0] if captured_callback else None

    def test_callback_acks_on_success(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer(serializer="json")

        handler = MagicMock(return_value=True)
        callback = self._get_callback(c, "q", handler)
        self.assertIsNotNone(callback)

        mock_channel = MagicMock()
        mock_method = MagicMock()
        mock_method.delivery_tag = 10
        body = json.dumps({"task": "do_work"}).encode("utf-8")

        callback(mock_channel, mock_method, MagicMock(), body)
        handler.assert_called_once_with({"task": "do_work"})
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=10)

    def test_callback_nacks_on_failure(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer(serializer="json")

        handler = MagicMock(return_value=False)
        callback = self._get_callback(c, "q", handler)

        mock_channel = MagicMock()
        mock_method = MagicMock()
        mock_method.delivery_tag = 20
        body = json.dumps({"task": "fail"}).encode("utf-8")

        callback(mock_channel, mock_method, MagicMock(), body)
        mock_channel.basic_nack.assert_called_once_with(delivery_tag=20, requeue=True)

    def test_callback_nacks_on_exception(self):
        from queues.rabbitmq.consumer import RabbitMQConsumer
        c = RabbitMQConsumer(serializer="json")

        handler = MagicMock(side_effect=RuntimeError("handler error"))
        callback = self._get_callback(c, "q", handler)

        mock_channel = MagicMock()
        mock_method = MagicMock()
        mock_method.delivery_tag = 30
        body = json.dumps({"task": "crash"}).encode("utf-8")

        callback(mock_channel, mock_method, MagicMock(), body)
        mock_channel.basic_nack.assert_called_once_with(delivery_tag=30, requeue=True)


if __name__ == "__main__":
    unittest.main()
