# -*- coding: utf-8 -*-
"""
@文件: example_tasks.py
@说明: Celery 任务示例
@时间: 2025-09-03

这是一个任务定义示例文件，展示如何定义各种类型的 Celery 任务。
实际项目中可以根据业务需求创建不同的任务文件。

任务命名规范:
    name="tasks.模块名.函数名"
    例如：name="tasks.email.send_email"
"""

from queues.celery_queue import celery_app
from loggers import logger


# ==================== 基础任务示例 ====================

@celery_app.app.task(name="tasks.example.add")
def add(x: int, y: int) -> int:
    """加法任务示例

    Args:
        x: 第一个数字
        y: 第二个数字

    Returns:
        两数之和

    使用示例:
        >>> from tasks.example_tasks import add
        >>> result = add.delay(4, 6)
        >>> result.get()  # 10
    """
    logger.info(f"执行加法任务: {x} + {y}")
    return x + y


# ==================== 重试任务示例 ====================

@celery_app.app.task(
    name="tasks.example.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60
)
def send_email(self, to: str, subject: str, body: str) -> bool:
    """发送邮件任务（带重试）

    Args:
        to: 收件人邮箱
        subject: 邮件主题
        body: 邮件正文

    Returns:
        是否发送成功

    使用示例:
        >>> from tasks.example_tasks import send_email
        >>> result = send_email.delay(
        ...     "user@example.com",
        ...     "测试邮件",
        ...     "这是一封测试邮件"
        ... )
    """
    try:
        logger.info(f"发送邮件到: {to}", subject=subject)

        # TODO: 实现真实的邮件发送逻辑
        # import smtplib
        # from email.mime.text import MIMEText
        # ...

        logger.info(f"邮件发送成功: {to}")
        return True

    except Exception as exc:
        logger.error("邮件发送失败", category="error", event="task_email_send_failed", custom={"to": to}, error=exc)

        # 重试任务（60 秒后重试）
        raise self.retry(exc=exc, countdown=60)


# ==================== 长时间运行任务示例 ====================

@celery_app.app.task(
    name="tasks.example.process_file",
    bind=True,
    time_limit=3600,  # 硬超时：1 小时
    soft_time_limit=3000  # 软超时：50 分钟
)
def process_file(self, file_path: str) -> dict:
    """处理文件任务（带进度更新）

    Args:
        file_path: 文件路径

    Returns:
        处理结果

    使用示例:
        >>> from tasks.example_tasks import process_file
        >>> result = process_file.delay("/path/to/file.csv")
        >>>
        >>> # 查询进度
        >>> from celery.result import AsyncResult
        >>> task_result = AsyncResult(result.id)
        >>> if task_result.state == 'PROGRESS':
        >>>     print(task_result.info.get('percent'))
    """
    try:
        logger.info(f"开始处理文件: {file_path}")

        # 更新任务状态
        self.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 100, 'percent': 0}
        )

        # TODO: 实现文件处理逻辑
        # 定期更新进度
        for i in range(100):
            if i % 10 == 0:
                self.update_state(
                    state='PROGRESS',
                    meta={
                        'current': i,
                        'total': 100,
                        'percent': i,
                        'status': f'处理中... {i}%'
                    }
                )

        logger.info(f"文件处理完成: {file_path}")

        return {
            'file_path': file_path,
            'status': 'completed',
            'lines_processed': 100,
        }

    except Exception as exc:
        logger.error("文件处理失败", category="error", event="task_file_process_failed", custom={"file_path": file_path}, error=exc)
        raise


# ==================== 定时任务示例 ====================

@celery_app.app.task(name="tasks.example.cleanup_temp_files")
def cleanup_temp_files() -> dict:
    """清理临时文件定时任务

    Returns:
        清理结果

    配置定时任务（在 celery_queue/config.py 中）:
        CELERY_BEAT_SCHEDULE = {
            'cleanup-temp-files-daily': {
                'task': 'tasks.example.cleanup_temp_files',
                'schedule': crontab(hour=2, minute=0),  # 每天凌晨 2 点
            },
        }
    """
    logger.info("开始清理临时文件")

    try:
        # TODO: 实现清理逻辑
        cleaned_count = 0
        cleaned_size = 0

        logger.info(f"临时文件清理完成", count=cleaned_count, size=cleaned_size)

        return {
            'cleaned_count': cleaned_count,
            'cleaned_size': cleaned_size,
        }

    except Exception as e:
        logger.error("清理临时文件失败", category="error", event="task_cleanup_failed", error=e)
        raise


@celery_app.app.task(name="tasks.example.generate_daily_report")
def generate_daily_report() -> dict:
    """生成每日报表定时任务

    Returns:
        报表生成结果

    配置定时任务:
        CELERY_BEAT_SCHEDULE = {
            'generate-daily-report': {
                'task': 'tasks.example.generate_daily_report',
                'schedule': crontab(hour=3, minute=0),  # 每天凌晨 3 点
            },
        }
    """
    logger.info("开始生成每日报表")

    try:
        from datetime import datetime

        report_date = datetime.now().strftime("%Y-%m-%d")

        # TODO: 实现报表生成逻辑
        report = {
            'date': report_date,
            'total_users': 1000,
            'active_users': 750,
            'new_users': 50,
        }

        logger.info(f"每日报表生成完成: {report_date}")

        return report

    except Exception as e:
        logger.error("报表生成失败", category="error", event="task_report_generate_failed", error=e)
        raise


# ==================== 业务任务示例 ====================

@celery_app.app.task(
    name="tasks.example.cancel_expired_order",
    bind=True,
    max_retries=3
)
def cancel_expired_order(self, order_id: int) -> bool:
    """取消超时订单任务

    Args:
        order_id: 订单 ID

    Returns:
        是否取消成功

    使用示例（在 Controller 中）:
        from datetime import datetime, timedelta
        from tasks.example_tasks import cancel_expired_order

        # 创建订单后，30 分钟后自动取消
        eta = datetime.now() + timedelta(minutes=30)
        cancel_expired_order.apply_async(
            args=[order_id],
            eta=eta
        )
    """
    try:
        logger.info(f"开始取消超时订单: {order_id}")

        # TODO: 实现订单取消逻辑
        # from models.order_model import OrderModel
        # model = OrderModel()
        # success = model.cancel_order(order_id)

        logger.info(f"订单已自动取消: {order_id}")

        return True

    except Exception as exc:
        logger.error("取消订单失败", category="error", event="task_order_cancel_failed", custom={"order_id": order_id}, error=exc)
        raise self.retry(exc=exc, countdown=60)


# ==================== 链式任务示例 ====================

@celery_app.app.task(name="tasks.example.download_file")
def download_file(url: str) -> str:
    """下载文件任务"""
    logger.info(f"下载文件: {url}")

    # TODO: 实现下载逻辑
    file_path = f"/tmp/downloaded_file.txt"

    logger.info(f"文件已下载到: {file_path}")
    return file_path


@celery_app.app.task(name="tasks.example.upload_file")
def upload_file(file_path: str) -> dict:
    """上传文件任务"""
    logger.info(f"上传文件: {file_path}")

    # TODO: 实现上传逻辑
    url = f"https://storage.example.com/file.txt"

    logger.info(f"文件已上传到: {url}")

    return {
        'file_path': file_path,
        'url': url,
    }


# 链式任务使用示例：
# from celery import chain
# task_chain = chain(
#     download_file.s("https://example.com/file.txt"),
#     upload_file.s(),
# )
# result = task_chain.apply_async()


# ==================== 使用说明 ====================

"""
在业务代码中使用任务:

1. View 层调用:
    from flask import Blueprint
    from tasks.example_tasks import send_email

    @blp.route("/send-email", methods=["POST"])
    def send_email_api():
        data = request.get_json()

        # 异步发送邮件
        result = send_email.delay(
            to=data['to'],
            subject=data['subject'],
            body=data['body']
        )

        return jsonify({
            'task_id': result.id,
            'message': '邮件发送中'
        })

2. Controller 层调用:
    from tasks.example_tasks import cancel_expired_order
    from datetime import datetime, timedelta

    class OrderController:
        def create_order(self, data):
            # 创建订单
            order_id = self.model.create_order(data)

            # 30 分钟后自动取消未支付订单
            eta = datetime.now() + timedelta(minutes=30)
            cancel_expired_order.apply_async(
                args=[order_id],
                eta=eta
            )

            return {'order_id': order_id}

3. 查询任务状态:
    from celery_queue import celery_app

    task_info = celery_app.get_task_info(task_id)
    print(task_info['status'])  # PENDING/STARTED/SUCCESS/FAILURE
"""
