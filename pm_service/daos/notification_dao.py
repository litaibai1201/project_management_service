# -*- coding: utf-8 -*-
"""
@文件: notification_dao.py
@说明: 通知 DAO
"""
from dbs.mysql_db import db
from tables.notification_table import NotificationModel
from .base_dao import BaseDAO


class NotificationDAO(BaseDAO):
    model = NotificationModel

    def query_by_recipient(self, work_no: str):
        return (db.session.query(NotificationModel)
                .filter(db.func.lower(NotificationModel.recipient) == (work_no or "").lower())
                .order_by(NotificationModel.created_at.desc()))

    def count_unread(self, work_no: str) -> int:
        return (db.session.query(NotificationModel)
                .filter(db.func.lower(NotificationModel.recipient) == (work_no or "").lower(),
                        NotificationModel.is_read == False)
                .count())

    def find_by_id_and_recipient(self, notif_id: str, work_no: str):
        return (db.session.query(NotificationModel)
                .filter(NotificationModel.id == notif_id,
                        db.func.lower(NotificationModel.recipient) == (work_no or "").lower())
                .first())

    def mark_all_read(self, work_no: str):
        (db.session.query(NotificationModel)
         .filter_by(recipient=work_no, is_read=False)
         .update({"is_read": True}))
        db.session.commit()

    def batch_insert(self, recipients: list, title: str, desc: str, link_type: str, link_id: str):
        for wn in recipients:
            db.session.add(NotificationModel(
                recipient=wn, title=title, desc=desc,
                link_type=link_type, link_id=link_id or "",
            ))
        db.session.commit()
