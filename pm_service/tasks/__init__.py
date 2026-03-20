# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 业务任务定义目录
@时间: 2025-09-03

这个目录用于定义项目中的所有异步任务。

任务分类建议:
    - email_tasks.py: 邮件相关任务
    - sms_tasks.py: 短信相关任务
    - report_tasks.py: 报表生成任务
    - cleanup_tasks.py: 清理任务
    - data_tasks.py: 数据处理任务
    - monitor_tasks.py: 监控任务

使用示例:
    # 1. 定义任务
    from celery_queue import celery_app

    @celery_app.app.task(name="tasks.email.send_email")
    def send_email(to, subject, body):
        # 邮件发送逻辑
        return True

    # 2. 调用任务
    from tasks.email_tasks import send_email
    result = send_email.delay("user@example.com", "Hello", "Test")

    # 3. 获取结果
    if result.ready():
        print(result.get())
"""

# 这里可以导入所有任务，方便统一管理
# from .email_tasks import send_email
# from .report_tasks import generate_daily_report
# from .cleanup_tasks import cleanup_temp_files

__all__ = [
    # 'send_email',
    # 'generate_daily_report',
    # 'cleanup_temp_files',
]
