# -*- coding: utf-8 -*-
"""通知控制器"""
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import NotificationModel


# ─── Module-level helper（在各 controller 中导入后直接调用）─────────────────────

def push_notification(recipients: list, title: str, desc: str = "",
                      link_type: str = "", link_id: str = "") -> None:
    """
    批量写入平台通知记录，并异步触发钉钉推送（均为 best-effort）。
    须在主事务 commit 之后调用，以避免嵌套事务问题。
    """
    clean = [str(wn).strip().lower() for wn in recipients if wn]
    if not clean:
        return

    # ── 1. 写入平台通知表 ─────────────────────────────────────────────────
    try:
        for wn in clean:
            db.session.add(NotificationModel(
                recipient=wn,
                title=title,
                desc=desc,
                link_type=link_type,
                link_id=link_id or "",
            ))
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass

    # ── 2. 异步推送钉钉消息 ───────────────────────────────────────────────
    try:
        from tasks.dingtalk_tasks import send_dingtalk_notification
        send_dingtalk_notification.delay(clean, title, desc)
    except Exception:
        pass  # Celery 未启动或配置缺失时静默跳过


# ─── Controller（REST 接口层调用）──────────────────────────────────────────────

class NotificationController:

    def list_notifications(self, work_no: str, page: int = 1, size: int = 30):
        """获取当前用户通知列表（按时间倒序）"""
        q = (db.session.query(NotificationModel)
             .filter_by(recipient=work_no)
             .order_by(NotificationModel.created_at.desc()))
        total = q.count()
        unread = (db.session.query(NotificationModel)
                  .filter_by(recipient=work_no, is_read=False)
                  .count())
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "data_list":    [n.to_dict() for n in items],
            "total_count":  total,
            "unread_count": unread,
        }

    def mark_read(self, work_no: str, notif_id: str):
        """标记单条为已读"""
        n = (db.session.query(NotificationModel)
             .filter_by(id=notif_id, recipient=work_no)
             .first())
        if n and not n.is_read:
            n.is_read = True
            db.session.commit()
        return True

    def mark_all_read(self, work_no: str):
        """标记全部为已读"""
        (db.session.query(NotificationModel)
         .filter_by(recipient=work_no, is_read=False)
         .update({"is_read": True}))
        db.session.commit()
        return True
