# -*- coding: utf-8 -*-
"""
@文件: notification_controller.py
@说明: 通知控制器
"""
from daos.notification_dao import NotificationDAO

_dao = NotificationDAO()


# ─── Module-level helper（在各 controller 中导入后直接调用）─────────────────────

def push_notification(recipients: list, title: str, desc: str = "",
                      link_type: str = "", link_id: str = "") -> None:
    """
    批量写入平台通知记录，并异步触发钉钉推送（均为 best-effort）。
    须在主事务 commit 之后调用，以避免嵌套事务问题。

    优先通过 Celery 异步执行（deliver_notification task），
    Celery 不可用时自动降级为同步写入 + 钉钉推送。
    """
    clean = [str(wn).strip().upper() for wn in recipients if wn]
    if not clean:
        return

    # ── 优先：Celery 异步入队（立即返回，不阻塞请求）────────────────────
    try:
        from tasks.notification_tasks import deliver_notification
        deliver_notification.delay(clean, title, desc, link_type, link_id or "")
        return
    except Exception:
        pass  # Celery 未启动或 import 失败，降级到同步模式

    # ── 降级：同步写入平台通知表 ─────────────────────────────────────────
    try:
        _dao.batch_insert(clean, title, desc, link_type, link_id)
    except Exception:
        try:
            from dbs.mysql_db import db
            db.session.rollback()
        except Exception:
            pass

    # ── 降级：同步触发钉钉推送（Celery task 仍可异步）───────────────────
    try:
        from tasks.dingtalk_tasks import send_dingtalk_notification
        send_dingtalk_notification.delay(clean, title, desc)
    except Exception:
        pass


# ─── Controller（REST 接口层调用）──────────────────────────────────────────────

class NotificationController:

    def list_notifications(self, work_no: str, page: int = 1, size: int = 30):
        """获取当前用户通知列表（按时间倒序）"""
        q = _dao.query_by_recipient(work_no)
        total = q.count()
        unread = _dao.count_unread(work_no)
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "data_list":    [n.to_dict() for n in items],
            "total_count":  total,
            "unread_count": unread,
        }

    def mark_read(self, work_no: str, notif_id: str):
        """标记单条为已读"""
        n = _dao.find_by_id_and_recipient(notif_id, work_no)
        if n and not n.is_read:
            n.is_read = True
            _dao.commit()
        return True

    def mark_all_read(self, work_no: str):
        """标记全部为已读"""
        _dao.mark_all_read(work_no)
        return True

    def send_daily_log_reminder(self, work_nos: list) -> int:
        """向指定成員發送日報填寫提醒（平台通知 + 钉钉推送）"""
        clean = [str(w).strip() for w in work_nos if w]
        if not clean:
            return 0
        push_notification(
            recipients=clean,
            title="请记得填写今日工作日报",
            desc="您今日尚未提交工作日报，请尽快前往系统填写。",
            link_type="daily_log",
        )
        return len(clean)
