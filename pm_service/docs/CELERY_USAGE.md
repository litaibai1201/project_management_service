# Celery 使用指南

Celery 是分布式任务队列系统，本框架集成了 `CeleryClientManager`，提供异步任务、定时任务、优先级队列和任务状态查询等能力。

---

## 1. 核心概念

| 概念 | 说明 |
|------|------|
| **Broker** | 消息代理，传递任务消息（框架默认使用 Redis DB 1） |
| **Worker** | 工作进程，从 Broker 取任务并执行 |
| **Task** | 异步任务单元，用 `@celery_app.app.task` 装饰定义 |
| **Result Backend** | 任务结果存储（框架默认使用 Redis DB 2） |
| **Beat** | 定时任务调度器，类似 Linux cron |

---

## 2. 快速开始

### 2.1 配置

`.env` 中配置 Broker 和 Backend：

```bash
CELERY_BROKER_URL=redis://127.0.0.1:6379/1
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/2
CELERY_TIMEZONE=Asia/Shanghai
```

### 2.2 在 Flask 中初始化

`CeleryClientManager` 需在 Flask 应用上下文中初始化后才能使用。框架通过可选调用 `celery_app.init_app(app)` 完成绑定：

```python
# app.py（按需启用）
from queues.celery_queue import celery_app
celery_app.init_app(app)
```

初始化后 Celery 实例挂载到 `app.extensions['celery']`，任务通过 `FlaskTask` 基类自动在 Flask 应用上下文中执行（可访问 `db`、`redis_client` 等扩展）。

### 2.3 定义任务

在 `tasks/` 目录下创建任务文件，命名规范为 `tasks.模块名.函数名`：

```python
# tasks/example_tasks.py
from queues.celery_queue import celery_app

@celery_app.app.task(name="tasks.example.add")
def add(x: int, y: int) -> int:
    return x + y
```

### 2.4 启动 Worker

```bash
# 消费 default 队列
celery -A queues.celery_queue.client.celery_app.app worker --loglevel=info

# 消费多个队列（含优先级队列）
celery -A queues.celery_queue.client.celery_app.app worker \
    -Q default,priority_high,priority_low \
    --loglevel=info

# 指定并发数（默认与 CPU 核数相同）
celery -A queues.celery_queue.client.celery_app.app worker \
    -Q default -c 4 --loglevel=info
```

---

## 3. 任务类型示例

### 3.1 基础异步任务

```python
from tasks.example_tasks import add

# 异步调用（立即返回，不等待结果）
result = add.delay(4, 6)
print(result.id)       # 任务 ID，可用于后续查询状态

# 同步等待结果（会阻塞，不推荐在请求处理中使用）
print(result.get(timeout=10))  # 10
```

### 3.2 带重试的任务

失败后按 `countdown` 秒延迟重试，最多 `max_retries` 次：

```python
@celery_app.app.task(
    name="tasks.example.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60   # 默认重试间隔 60 秒
)
def send_email(self, to: str, subject: str, body: str) -> bool:
    try:
        # 发送逻辑...
        return True
    except Exception as exc:
        # 指数退避重试：60s → 120s → 240s
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### 3.3 带进度更新的长任务

适用于文件处理、数据导入等耗时操作，前端可轮询进度：

```python
@celery_app.app.task(
    name="tasks.example.process_file",
    bind=True,
    time_limit=3600,       # 硬超时 1 小时
    soft_time_limit=3000   # 软超时 50 分钟（抛出 SoftTimeLimitExceeded）
)
def process_file(self, file_path: str) -> dict:
    total = 100
    for i in range(total):
        # 更新进度（每 10% 更新一次）
        if i % 10 == 0:
            self.update_state(
                state='PROGRESS',
                meta={'current': i, 'total': total, 'percent': i}
            )
        # 实际处理逻辑...

    return {'file_path': file_path, 'status': 'completed'}
```

查询进度：

```python
from queues.celery_queue import celery_app

info = celery_app.get_task_info(task_id)
# info['status'] 为 'PROGRESS' 时
print(info['info']['percent'])   # 当前进度百分比
```

### 3.4 定时延迟执行

在指定时间执行任务，适用于超时自动取消订单等场景：

```python
from datetime import datetime, timedelta
from tasks.example_tasks import cancel_expired_order

# 创建订单后，30 分钟后自动触发取消
eta = datetime.now() + timedelta(minutes=30)
cancel_expired_order.apply_async(args=[order_id], eta=eta)

# 60 秒后执行
cancel_expired_order.apply_async(args=[order_id], countdown=60)
```

### 3.5 链式任务（Pipeline）

上一个任务的返回值自动作为下一个任务的第一个参数：

```python
from celery import chain
from tasks.example_tasks import download_file, upload_file

# 下载 → 处理 → 上传，串行执行
task_chain = chain(
    download_file.s("https://example.com/file.txt"),
    process_file.s(),    # 接收 download_file 的返回值（file_path）
    upload_file.s()      # 接收 process_file 的返回值
)
result = task_chain.apply_async()
```

### 3.6 并行任务组（Group）

```python
from celery import group
from tasks.example_tasks import send_email

# 并行发送多封邮件
email_group = group([
    send_email.s("user1@example.com", "通知", "内容"),
    send_email.s("user2@example.com", "通知", "内容"),
    send_email.s("user3@example.com", "通知", "内容"),
])
result = email_group.apply_async()
```

---

## 4. 优先级队列

框架预定义了三个队列，优先级从高到低：

| 队列名 | Exchange 路由键 | 适用场景 |
|--------|----------------|---------|
| `priority_high` | `task.priority.high` | 支付通知、验证码、紧急告警 |
| `default` | `task.default` | 常规异步任务 |
| `priority_low` | `task.priority.low` | 报表生成、日志清理、低优先级任务 |

发送到指定队列：

```python
# 发送到高优先级队列
send_email.apply_async(
    args=["user@example.com", "验证码", "123456"],
    queue='priority_high'
)

# 在任务定义时固定路由
@celery_app.app.task(
    name="tasks.notify.send_sms",
    queue='priority_high'
)
def send_sms(phone: str, content: str):
    ...
```

---

## 5. 定时任务（Beat）

### 5.1 配置定时任务

在 `queues/celery_queue/config.py` 中配置：

```python
from celery.schedules import crontab
from datetime import timedelta

CELERY_BEAT_SCHEDULE = {
    # 每天凌晨 2 点清理临时文件
    'cleanup-temp-files-daily': {
        'task': 'tasks.example.cleanup_temp_files',
        'schedule': crontab(hour=2, minute=0),
        'options': {'expires': 3600}   # 任务过期时间（秒），防止积压重复执行
    },

    # 每天凌晨 3 点生成报表
    'generate-daily-report': {
        'task': 'tasks.example.generate_daily_report',
        'schedule': crontab(hour=3, minute=0),
    },

    # 每 30 秒执行健康检查
    'health-check': {
        'task': 'tasks.monitor.health_check',
        'schedule': timedelta(seconds=30),
    },

    # 每周一凌晨 1 点执行全量备份
    'full-backup-weekly': {
        'task': 'tasks.backup.full_backup',
        'schedule': crontab(hour=1, minute=0, day_of_week=1),
    },
}
```

### 5.2 Crontab 表达式参考

```python
crontab(minute='*')                          # 每分钟
crontab(minute=0)                            # 每小时整点
crontab(minute='*/15')                       # 每 15 分钟
crontab(hour=2, minute=30)                   # 每天凌晨 2:30
crontab(hour=3, minute=0, day_of_week=1)     # 每周一凌晨 3 点
crontab(hour=4, minute=0, day_of_month=1)    # 每月 1 号凌晨 4 点
crontab(hour='*/2', day_of_week='mon-fri')   # 工作日每 2 小时
crontab(month_of_year='*/3', day_of_month=1, hour=0, minute=0)  # 每季度第一天
```

### 5.3 启动 Beat 调度器

```bash
# 单独启动 Beat
celery -A queues.celery_queue.client.celery_app.app beat --loglevel=info

# 开发环境：Worker + Beat 合并启动（生产环境应分开）
celery -A queues.celery_queue.client.celery_app.app worker --beat --loglevel=info
```

---

## 6. 任务状态管理

### 6.1 查询任务状态

```python
from queues.celery_queue import celery_app

info = celery_app.get_task_info(task_id)
```

返回结构：

```python
{
    'task_id': 'abc-123',
    'status': 'SUCCESS',      # PENDING / STARTED / PROGRESS / SUCCESS / FAILURE / REVOKED
    'ready': True,
    'successful': True,
    'failed': False,
    'result': {...},          # 任务成功时的返回值
    'error': '...',           # 任务失败时的错误信息
    'info': {...},            # PROGRESS 状态时的进度信息
}
```

任务状态流转：

```
PENDING → STARTED → SUCCESS
                  ↘ FAILURE（可重试 → PENDING）
         ↘ REVOKED（被手动撤销）
```

### 6.2 撤销任务

```python
# 撤销未开始的任务（从队列中移除）
celery_app.revoke_task(task_id)

# 强制终止正在运行的任务
celery_app.revoke_task(task_id, terminate=True, signal='SIGTERM')
```

### 6.3 Worker 监控

```python
# 获取所有正在执行的任务
active = celery_app.get_active_tasks()

# 获取已调度（等待中）的任务
scheduled = celery_app.get_scheduled_tasks()

# 获取所有已注册的任务名称
registered = celery_app.get_registered_tasks()

# 清空队列（谨慎！）
celery_app.purge_queue('default')
```

---

## 7. 在业务代码中调用

### View 层（返回 task_id 给前端轮询）

```python
from flask.views import MethodView
from tasks.example_tasks import process_file
from utils.response import response_result

@blp.route("/process")
class ProcessApi(MethodView):
    @jwt_required()
    def post(self):
        file_path = request.json.get("file_path")
        result = process_file.delay(file_path)
        return response_result(content={"task_id": result.id})

@blp.route("/task/<task_id>")
class TaskStatusApi(MethodView):
    def get(self, task_id):
        from queues.celery_queue import celery_app
        info = celery_app.get_task_info(task_id)
        return response_result(content=info)
```

### Controller 层（触发后台任务）

```python
from datetime import datetime, timedelta
from tasks.example_tasks import cancel_expired_order, send_email

class OrderController:
    def create_order(self, data: dict) -> dict:
        order_id = self.model.create(data)

        # 发送确认邮件（异步，不阻塞响应）
        send_email.delay(data["email"], "订单确认", f"订单 {order_id} 已创建")

        # 30 分钟后自动取消未支付订单
        cancel_expired_order.apply_async(
            args=[order_id],
            eta=datetime.now() + timedelta(minutes=30)
        )

        return {"order_id": order_id}
```

---

## 8. 注意事项

1. **任务参数必须可序列化**：默认使用 JSON，参数只能是基础类型（int/str/list/dict），不能传递数据库对象
2. **任务幂等性**：任务可能因重试而执行多次，业务逻辑需要保证幂等
3. **避免在任务中直接导入 Flask `current_app`**：`FlaskTask` 基类已自动推入应用上下文
4. **生产环境分开部署**：Beat 调度器和 Worker 应分开启动，避免 Beat 单点故障影响 Worker
5. **结果过期清理**：`CELERY_RESULT_EXPIRES=3600` 默认 1 小时后自动清理，长时间任务可适当调大
