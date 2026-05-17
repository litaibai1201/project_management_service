# -*- coding: utf-8 -*-
"""通知控制器"""
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import NotificationModel


# ─── Module-level helper（在各 controller 中导入后直接调用）─────────────────────

def push_notification(recipients: list, title: str, desc: str = "",
                      link_type: str = "", link_id: str = "") -> None:
    """
    批量写入通知记录（best-effort：异常不会影响主业务）。
    须在主事务 commit 之后调用，以避免嵌套事务问题。
    """
    try:
        for wn in recipients:
            if not wn:
                continue
            n = NotificationModel(
                recipient=str(wn).strip().lower(),
                title=title,
                desc=desc,
                link_type=link_type,
                link_id=link_id or "",
            )
            db.session.add(n)
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


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
