# RabbitMQ 使用指南

RabbitMQ 是开源消息代理，本框架集成了 `RabbitMQClientManager`、`RabbitMQProducer`、`RabbitMQConsumer`，提供完整的消息发布、订阅和异步通信能力。

---

## 1. 核心概念

| 概念 | 说明 |
|------|------|
| **Connection** | TCP 连接，连接 RabbitMQ 服务器 |
| **Channel** | 信道，复用 TCP 连接的逻辑通道 |
| **Exchange** | 交换机，接收生产者消息并路由到队列 |
| **Queue** | 队列，存储消息直到消费者取走 |
| **Binding** | 绑定关系，将 Exchange 和 Queue 关联 |
| **Routing Key** | 路由键，决定消息如何路由到队列 |

### Exchange 类型

| 类型 | 路由规则 | 适用场景 |
|------|----------|----------|
| `direct` | 精确匹配 routing key | 任务分发、告警路由 |
| `topic` | 通配符匹配（`*` 匹配一个词，`#` 匹配多个词） | 日志分级、多维度过滤 |
| `fanout` | 广播到所有绑定队列，忽略 routing key | 系统通知、配置同步 |
| `headers` | 根据消息头属性路由 | 复杂路由条件 |

---

## 2. 快速开始

### 2.1 配置

`.env` 中配置 RabbitMQ 连接信息：

```bash
RABBITMQ_HOST=127.0.0.1
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VIRTUAL_HOST=/
RABBITMQ_CONNECTION_TIMEOUT=10
RABBITMQ_HEARTBEAT=600
```

### 2.2 在 Flask 中初始化

`RabbitMQClientManager` 需在 Flask 应用上下文中初始化。框架通过可选调用 `rabbitmq_client.init_app(app)` 完成绑定：

```python
# app.py（按需启用）
from queues.rabbitmq import rabbitmq_client
rabbitmq_client.init_app(app)
```

初始化后客户端绑定到 `app.extensions['rabbitmq']`，自动管理连接复用（连接断开时自动重连）。

### 2.3 导入模块

```python
from queues.rabbitmq import rabbitmq_client    # 连接管理
from queues.rabbitmq import RabbitMQProducer   # 消息发布
from queues.rabbitmq import RabbitMQConsumer   # 消息消费
```

---

## 3. 消息发布（Producer）

### 3.1 简单发送（直接到队列）

```python
from queues.rabbitmq import RabbitMQProducer

producer = RabbitMQProducer()

# 发送字符串
producer.send_to_queue('hello', 'Hello World!')

# 发送字典（JSON 序列化）
producer.send_to_queue('tasks', {'task': 'send_email', 'to': 'user@example.com'})

# 带过期时间（60 秒后未消费则丢弃）
producer.send_to_queue(
    'tasks',
    {'task': 'send_sms'},
    expiration='60000'   # 毫秒
)
```

### 3.2 发布到交换机

```python
producer = RabbitMQProducer()

# fanout：广播到所有绑定队列
producer.publish('logs', '', '系统日志消息', exchange_type='fanout')

# direct：精确路由
producer.publish('direct_logs', 'error', '数据库连接失败', exchange_type='direct')
producer.publish('direct_logs', 'info', '用户登录', exchange_type='direct')

# topic：通配符路由
producer.publish('topic_logs', 'kernel.error', '内核错误', exchange_type='topic')
producer.publish('topic_logs', 'app.warning', '应用警告', exchange_type='topic')
```

### 3.3 发送 JSON 消息（便捷方法）

`send_json()` 无论 Producer 使用何种序列化方式，都强制以 JSON 发送：

```python
producer = RabbitMQProducer()
producer.send_json('order_queue', {
    'order_id': 'ORD-2024001',
    'user_id': 123,
    'amount': 99.9,
    'items': ['item1', 'item2']
})
```

### 3.4 批量发送

```python
producer = RabbitMQProducer()
messages = [
    {'id': 1, 'action': 'create', 'data': {}},
    {'id': 2, 'action': 'update', 'data': {}},
    {'id': 3, 'action': 'delete', 'data': {}},
]
count = producer.send_batch('batch_tasks', messages)
print(f"成功发送 {count} 条消息")
```

### 3.5 延迟消息

通过消息 TTL + 死信队列实现延迟消费：

```python
producer = RabbitMQProducer()

# 30 分钟后处理（自动取消未支付订单）
producer.send_delayed_message(
    'order_cancel',
    {'order_id': 'ORD-2024001'},
    delay_ms=30 * 60 * 1000   # 1800000 毫秒
)

# 10 秒后发送提醒
producer.send_delayed_message(
    'reminder_queue',
    {'user_id': 123, 'message': '您有未完成的操作'},
    delay_ms=10000
)
```

> **原理**：自动创建名为 `{queue}.delay` 的临时队列，配置 `x-dead-letter-exchange` 和 `x-message-ttl`。消息 TTL 到期后由 RabbitMQ 自动转发到目标队列。

---

## 4. 消息消费（Consumer）

### 4.1 简单消费（手动确认）

```python
from queues.rabbitmq import RabbitMQConsumer

def handle_message(channel, method, properties, body):
    import json
    message = json.loads(body.decode('utf-8'))
    print(f"收到消息: {message}")

    # 手动确认（消息从队列删除）
    channel.basic_ack(delivery_tag=method.delivery_tag)

consumer = RabbitMQConsumer()
consumer.consume('hello', handle_message)   # 阻塞，持续消费
```

### 4.2 工作队列（推荐）

`create_worker()` 封装了消息确认逻辑：handler 返回 `True` 则确认，返回 `False` 则重新入队：

```python
from queues.rabbitmq import RabbitMQConsumer

def process_task(message: dict) -> bool:
    """
    Returns:
        True  - 处理成功，消息从队列永久删除
        False - 处理失败，消息重新入队稍后重试
    """
    try:
        task_type = message.get('task')
        if task_type == 'send_email':
            send_email(message['to'], message['subject'])
            return True
        return False
    except Exception:
        return False

consumer = RabbitMQConsumer(serializer='json', prefetch_count=1)
consumer.create_worker('tasks', process_task)
```

> **prefetch_count=1**：每次只取一条消息，确保多个 Worker 均匀分配任务，避免消息堆积在某个 Worker。

### 4.3 订阅模式（Exchange）

```python
from queues.rabbitmq import RabbitMQConsumer

def handle_log(channel, method, properties, body):
    message = body.decode('utf-8')
    print(f"日志: {message}")
    channel.basic_ack(delivery_tag=method.delivery_tag)

consumer = RabbitMQConsumer()

# fanout：接收所有广播消息
consumer.subscribe('logs', [''], handle_log, exchange_type='fanout')

# direct：只接收 error 和 warning 级别日志
consumer.subscribe(
    'direct_logs',
    ['error', 'warning'],
    handle_log,
    exchange_type='direct'
)

# topic：接收所有 kernel 相关 或 所有 error 级别的日志
consumer.subscribe(
    'topic_logs',
    ['kernel.*', '*.error'],
    handle_log,
    exchange_type='topic'
)
```

### 4.4 单条拉取（非阻塞）

适用于按需检查队列，不阻塞主线程：

```python
from queues.rabbitmq import RabbitMQConsumer

consumer = RabbitMQConsumer()
result = consumer.get_one('task_queue')   # auto_ack=True（默认）

if result:
    method, properties, body = result
    import json
    message = json.loads(body.decode('utf-8'))
    print(f"取到消息: {message}")
else:
    print("队列为空")
```

---

## 5. 消息确认机制

| 方法 | 说明 |
|------|------|
| `consumer.ack_message(channel, delivery_tag)` | 确认消息，从队列永久删除 |
| `consumer.nack_message(channel, delivery_tag, requeue=True)` | 拒绝并重新入队（稍后重试） |
| `consumer.nack_message(channel, delivery_tag, requeue=False)` | 拒绝并丢弃（或进入死信队列） |
| `consumer.reject_message(channel, delivery_tag, requeue=False)` | 拒绝单条消息（丢弃） |

```python
def handle_message(channel, method, properties, body):
    from queues.rabbitmq import RabbitMQConsumer
    consumer = RabbitMQConsumer()

    try:
        message = json.loads(body.decode('utf-8'))
        process(message)
        # 处理成功：确认消息
        consumer.ack_message(channel, method.delivery_tag)
    except TemporaryError:
        # 临时错误：重新入队，稍后重试
        consumer.nack_message(channel, method.delivery_tag, requeue=True)
    except PermanentError:
        # 永久错误：丢弃，不重试
        consumer.reject_message(channel, method.delivery_tag, requeue=False)
```

---

## 6. 连接与队列管理

### 6.1 手动操作 Channel

需要自定义声明交换机或队列时，直接使用 `rabbitmq_client`：

```python
from queues.rabbitmq import rabbitmq_client

with rabbitmq_client.get_channel() as channel:
    # 声明交换机
    rabbitmq_client.declare_exchange(channel, 'my_exchange', 'topic')

    # 声明队列（带 TTL 和最大长度限制）
    rabbitmq_client.declare_queue(
        channel,
        'my_queue',
        durable=True,
        arguments={
            'x-message-ttl': 3600000,    # 消息存活 1 小时
            'x-max-length': 10000,       # 队列最多 10000 条
        }
    )

    # 绑定队列到交换机
    rabbitmq_client.bind_queue(
        channel,
        queue='my_queue',
        exchange='my_exchange',
        routing_key='order.*'
    )
```

### 6.2 队列监控

```python
from queues.rabbitmq import rabbitmq_client

with rabbitmq_client.get_channel() as channel:
    # 获取队列中的消息数量
    count = rabbitmq_client.get_queue_size(channel, 'task_queue')
    print(f"队列中有 {count} 条待处理消息")

    # 清空队列（谨慎！不可恢复）
    cleared = rabbitmq_client.purge_queue(channel, 'task_queue')
    print(f"已清空 {cleared} 条消息")
```

---

## 7. 在业务代码中集成

### View 层（触发异步任务）

```python
from flask.views import MethodView
from queues.rabbitmq import RabbitMQProducer
from utils.response import response_result

producer = RabbitMQProducer()

@blp.route("/orders")
class OrderApi(MethodView):
    @jwt_required()
    def post(self):
        data = request.get_json()
        order_id = order_controller.create(data)

        # 发送订单创建事件（异步，不阻塞响应）
        producer.send_json('order_events', {
            'event': 'order_created',
            'order_id': order_id,
            'user_id': get_jwt_identity()
        })

        return response_result(content={'order_id': order_id}, msg="创建成功")
```

### Controller 层（发送通知）

```python
from queues.rabbitmq import RabbitMQProducer

producer = RabbitMQProducer()

class OrderController:
    def create_order(self, data: dict) -> dict:
        order_id = self.model.create(data)

        # 广播订单事件（fanout，所有关注方都收到）
        producer.publish(
            'order_events',
            '',
            {'order_id': order_id, 'status': 'created'},
            exchange_type='fanout'
        )

        # 30 分钟后自动检查支付状态
        producer.send_delayed_message(
            'order_timeout_check',
            {'order_id': order_id},
            delay_ms=30 * 60 * 1000
        )

        return {'order_id': order_id}
```

### Worker 进程（独立消费者）

Worker 通常以独立进程运行，不在 Flask 请求上下文中：

```python
# workers/order_worker.py
from queues.rabbitmq import RabbitMQConsumer

def handle_order_event(message: dict) -> bool:
    event_type = message.get('event')
    if event_type == 'order_created':
        send_confirmation_email(message['user_id'], message['order_id'])
        return True
    return False

if __name__ == '__main__':
    consumer = RabbitMQConsumer(serializer='json', prefetch_count=5)
    print("订单 Worker 已启动，等待消息...")
    consumer.create_worker('order_events', handle_order_event)
```

```bash
# 启动 Worker
python workers/order_worker.py
```

---

## 8. 与 Celery 的区别

| 对比维度 | RabbitMQ（直接使用） | Celery |
|----------|---------------------|--------|
| 使用场景 | 服务间解耦、事件驱动 | 异步任务、定时任务 |
| 任务结果 | 不追踪结果 | 可查询状态和结果 |
| 定时任务 | 不支持 | 支持（Beat 调度器） |
| 重试机制 | 手动（nack + requeue） | 自动（`max_retries`） |
| Flask 集成 | 通过 `init_app()` | `FlaskTask` 自动推入上下文 |
| 消费者部署 | 独立 Python 进程 | `celery worker` 命令 |

> Celery 也可使用 RabbitMQ 作为 Broker（两者不冲突）。Celery 负责任务调度，直接使用 RabbitMQ 则适合更灵活的消息路由场景。

---

## 9. 注意事项

1. **必须手动确认消息**：`auto_ack=False`（默认）时，处理完成后必须调用 `basic_ack`，否则消息不会从队列删除，Worker 重启后会重复消费
2. **序列化一致性**：生产者和消费者的 `serializer` 必须相同（默认均为 `json`）
3. **心跳配置**：长时间阻塞消费时，需配置合理的 `RABBITMQ_HEARTBEAT`（默认 600 秒）防止连接被防火墙关闭
4. **消息持久化**：`durable=True`（默认）+ `delivery_mode=2`（默认）才能保证 RabbitMQ 重启后消息不丢失
5. **延迟队列限制**：`send_delayed_message` 基于消息级别 TTL 实现，同一延迟队列的所有消息 TTL 相同（不支持不同延迟时间混用同一队列）
6. **生产环境密码加密**：`RABBITMQ_PASSWORD` 支持 `ENC(...)` 格式加密，参见 `CONFIGURATION.md`
