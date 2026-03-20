# -*- coding: utf-8 -*-
"""
@文件: config.py
@说明: Celery Beat 定时任务配置示例
@时间: 2025-09-03

Celery Beat 是 Celery 的定时任务调度器，类似于 Linux 的 cron。

配置方式:
    1. 在业务代码中定义任务（如 tasks/ 目录）
    2. 在此文件或业务配置中配置定时任务
    3. 启动 Celery Beat 调度器:
       celery -A celery_queue.client.celery_app.app beat --loglevel=info

调度类型:
    - crontab: 类似 cron 的时间调度
    - timedelta: 固定时间间隔调度
    - solar: 太阳时调度（日出、日落）

使用示例:
    from celery.schedules import crontab
    from datetime import timedelta

    # Crontab 调度（每天凌晨 2 点执行）
    'task-name': {
        'task': 'tasks.cleanup.cleanup_temp_files',
        'schedule': crontab(hour=2, minute=0),
    }

    # 时间间隔调度（每 30 秒执行一次）
    'task-name': {
        'task': 'tasks.monitor.check',
        'schedule': timedelta(seconds=30),
    }
"""

from celery.schedules import crontab
from datetime import timedelta


# ==================== Celery Beat 定时任务配置示例 ====================

# 这是一个配置示例，实际项目中应根据业务需求配置
# 任务应该在业务代码中定义（如 tasks/ 目录）

CELERY_BEAT_SCHEDULE = {
    # ==================== 示例配置（请根据实际业务需求修改） ====================

    # 示例：每日凌晨 2 点执行清理任务
    # 'cleanup-temp-files-daily': {
    #     'task': 'tasks.cleanup.cleanup_temp_files',  # 任务路径
    #     'schedule': crontab(hour=2, minute=0),
    #     'options': {
    #         'expires': 3600,  # 任务过期时间（秒）
    #     }
    # },

    # 示例：每小时执行健康检查
    # 'health-check-hourly': {
    #     'task': 'tasks.monitor.health_check',
    #     'schedule': crontab(minute=0),  # 每小时的第 0 分钟
    # },

    # 示例：每 30 秒执行一次
    # 'quick-check': {
    #     'task': 'tasks.monitor.quick_check',
    #     'schedule': timedelta(seconds=30),
    # },
}


# ==================== Crontab 表达式参考 ====================

"""
Crontab 字段说明:
    minute: 分钟（0-59）
    hour: 小时（0-23）
    day_of_week: 星期几（0-6 或 mon,tue,wed,thu,fri,sat,sun）
    day_of_month: 月份中的第几天（1-31）
    month_of_year: 月份（1-12）

特殊符号:
    *: 任意值
    */n: 每 n 个单位
    a-b: 范围
    a,b,c: 列表

常用示例:
    crontab(minute='*')                         # 每分钟
    crontab(minute=0)                           # 每小时
    crontab(minute='*/15')                      # 每 15 分钟
    crontab(hour=2, minute=30)                  # 每天凌晨 2:30
    crontab(hour=3, minute=0, day_of_week=1)    # 每周一凌晨 3 点
    crontab(hour=4, minute=0, day_of_month=1)   # 每月 1 号凌晨 4 点
    crontab(hour='*/2', day_of_week='mon-fri')  # 工作日每 2 小时
"""


# ==================== 工具函数 ====================

def get_beat_schedule():
    """获取 Beat 调度配置

    Returns:
        定时任务配置字典
    """
    return CELERY_BEAT_SCHEDULE


def add_periodic_task(name: str, task: str, schedule, **options):
    """动态添加定时任务

    Args:
        name: 任务名称
        task: 任务路径
        schedule: 调度配置（crontab 或 timedelta）
        **options: 其他选项
    """
    CELERY_BEAT_SCHEDULE[name] = {
        'task': task,
        'schedule': schedule,
        'options': options,
    }
