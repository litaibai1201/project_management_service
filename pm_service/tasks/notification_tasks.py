# -*- coding: utf-8 -*-
"""
@文件: notification_tasks.py
@说明: 通知相关定时任务
        #9  每天早上 9:00 — 检查 3 天内到期的功能任务/临时任务，通知负责人
        #10 每天早上 9:00 — 检查已逾期（未完成）的功能任务/临时任务，通知负责人 + 专案PM
        #11 每天 17:30  — 提醒当天未提交日报的成员
"""

import json
from datetime import date, timedelta

from queues.celery_queue import celery_app
from loggers import logger


# ── 实时通知投递（写 DB + 推钉钉，全程异步）──────────────────────────────────

@celery_app.app.task(
    name="tasks.notification.deliver",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def deliver_notification(self, recipients: list, title: str, desc: str = "",
                          link_type: str = "", link_id: str = "") -> None:
    """
    将平台通知写入数据库，并触发钉钉推送。
    由 push_notification() 通过 .delay() 调用，完全异步，不阻塞请求响应。
    """
    from dbs.mysql_db import db
    from dbs.mysql_db.model_tables import NotificationModel

    # 1. 写入平台通知表
    try:
        for wn in recipients:
            db.session.add(NotificationModel(
                recipient=wn,
                title=title,
                desc=desc,
                link_type=link_type,
                link_id=link_id or "",
            ))
        db.session.commit()
    except Exception as e:
        logger.error("[deliver_notification] DB 写入失败",
                     category="error", event="deliver_notification_db_error", error=e)
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            raise self.retry(exc=e)
        except Exception:
            pass

    # 2. 钉钉推送（已有异步 task，直接复用）
    try:
        from tasks.dingtalk_tasks import send_dingtalk_notification
        send_dingtalk_notification.delay(recipients, title, desc)
    except Exception:
        pass  # Celery 或钉钉配置缺失时静默跳过


# ── #9 即将到期提醒（3天内）────────────────────────────────────────────────────

@celery_app.app.task(name="tasks.notification.deadline_alert")
def deadline_alert() -> dict:
    """每天 09:00 检查未完成任务：距截止日期 ≤ 3 天时通知负责人（涵盖功能任务和临时任务）"""
    from dbs.mysql_db import db
    from dbs.mysql_db.model_tables import FunctionDataModel, TemporaryDutyModel, ProjectDataModel
    from controllers.notification_controller import push_notification

    today = date.today()
    threshold = today + timedelta(days=3)
    today_str = today.isoformat()
    threshold_str = threshold.isoformat()

    notified = 0
    try:
        # ── 专案功能任务 ───────────────────────────────────────────────────────
        funcs = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.function_status.in_([1, 2]))
            .all()
        )
        for f in funcs:
            end_date = f.latest_expected_end_date or f.expected_end_date or ""
            if not end_date or not (today_str <= end_date <= threshold_str):
                continue
            resp = json.loads(f.responsible) if f.responsible else []
            if not resp:
                continue
            project = db.session.query(ProjectDataModel).filter_by(id=f.project_id).first()
            proj_nm = project.project_nm if project else ""
            push_notification(
                recipients=resp,
                title="任務即將到期提醒",
                desc=f"【{proj_nm}】任務「{f.function_nm}」將於 {end_date} 到期，請儘快完成。",
                link_type="project",
                link_id=f.project_id,
            )
            notified += len(resp)

        # ── 临时任务 ──────────────────────────────────────────────────────────
        duties = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.duty_status == 1)  # 进行中
            .all()
        )
        for d in duties:
            end_date = d.latest_expected_end_date or d.expected_end_date or ""
            if not end_date or not (today_str <= end_date <= threshold_str):
                continue
            resp = json.loads(d.responsible) if d.responsible else []
            if not resp:
                continue
            push_notification(
                recipients=resp,
                title="任務即將到期提醒",
                desc=f"臨時任務「{d.duty_nm}」將於 {end_date} 到期，請儘快完成。",
                link_type="duty",
                link_id=d.id,
            )
            notified += len(resp)

        logger.info(f"[deadline_alert] 已發送到期提醒，通知人次: {notified}")
    except Exception as e:
        logger.error("deadline_alert 任務執行失敗", category="error",
                     event="task_deadline_alert_failed", error=e)
    return {"notified": notified}


# ── #10 逾期提醒 ──────────────────────────────────────────────────────────────

@celery_app.app.task(name="tasks.notification.overdue_alert")
def overdue_alert() -> dict:
    """每天 09:00 检查已逾期（截止日 < 今天、未完成）任务，通知负责人；功能任务同时通知专案PM"""
    from dbs.mysql_db import db
    from dbs.mysql_db.model_tables import FunctionDataModel, TemporaryDutyModel, ProjectDataModel
    from controllers.notification_controller import push_notification

    today_str = date.today().isoformat()

    notified = 0
    try:
        # ── 专案功能任务 ───────────────────────────────────────────────────────
        funcs = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.function_status.in_([1, 2]))
            .all()
        )
        for f in funcs:
            end_date = f.latest_expected_end_date or f.expected_end_date or ""
            if not end_date or end_date >= today_str:
                continue
            project = db.session.query(ProjectDataModel).filter_by(id=f.project_id).first()
            proj_nm = project.project_nm if project else ""
            proj_pm = project.project_pm if project else ""
            resp = json.loads(f.responsible) if f.responsible else []
            recipients = list({*resp, proj_pm} - {""})
            if not recipients:
                continue
            push_notification(
                recipients=recipients,
                title="任務逾期提醒",
                desc=f"【{proj_nm}】任務「{f.function_nm}」已逾期（截止日：{end_date}），請儘快處理。",
                link_type="project",
                link_id=f.project_id,
            )
            notified += len(recipients)

        # ── 临时任务 ──────────────────────────────────────────────────────────
        duties = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.duty_status == 1)
            .all()
        )
        for d in duties:
            end_date = d.latest_expected_end_date or d.expected_end_date or ""
            if not end_date or end_date >= today_str:
                continue
            resp = json.loads(d.responsible) if d.responsible else []
            if not resp:
                continue
            push_notification(
                recipients=resp,
                title="任務逾期提醒",
                desc=f"臨時任務「{d.duty_nm}」已逾期（截止日：{end_date}），請儘快處理。",
                link_type="duty",
                link_id=d.id,
            )
            notified += len(resp)

        logger.info(f"[overdue_alert] 已發送逾期提醒，通知人次: {notified}")
    except Exception as e:
        logger.error("overdue_alert 任務執行失敗", category="error",
                     event="task_overdue_alert_failed", error=e)
    return {"notified": notified}


# ── #11 日报提交提醒 ──────────────────────────────────────────────────────────

@celery_app.app.task(name="tasks.notification.daily_log_reminder")
def daily_log_reminder() -> dict:
    """
    每天 17:30 提醒：当天有进行中任务（功能任务 or 临时任务）的成员，
    若尚未提交当天日报则发送通知。
    """
    from dbs.mysql_db import db
    from dbs.mysql_db.model_tables import FunctionDataModel, TemporaryDutyModel, DailyLogModel
    from controllers.notification_controller import push_notification

    today_str = date.today().isoformat()

    notified = 0
    try:
        members: set = set()

        # 有进行中专案功能任务的成员
        active_funcs = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.function_status == 2)
            .all()
        )
        for f in active_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            members.update(resp)

        # 有进行中临时任务的成员
        active_duties = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.duty_status == 1)
            .all()
        )
        for d in active_duties:
            resp = json.loads(d.responsible) if d.responsible else []
            members.update(resp)

        members.discard("")

        # 过滤掉已提交日报的成员
        submitted = set(
            row.work_no
            for row in db.session.query(DailyLogModel)
            .filter(
                DailyLogModel.log_date == today_str,
                DailyLogModel.log_status == 2,
            )
            .all()
        )

        remind_list = list(members - submitted)
        if remind_list:
            push_notification(
                recipients=remind_list,
                title="日報提交提醒",
                desc="今日工作日報尚未提交，請在下班前完成填寫。",
                link_type="",
                link_id="",
            )
            notified = len(remind_list)

        logger.info(f"[daily_log_reminder] 已發送日報提醒，通知人次: {notified}")
    except Exception as e:
        logger.error("daily_log_reminder 任務執行失敗", category="error",
                     event="task_daily_log_reminder_failed", error=e)
    return {"notified": notified}
