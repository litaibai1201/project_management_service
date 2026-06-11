# -*- coding: utf-8 -*-
"""
@文件: notification_table.py
@说明: 消息通知数据表
"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import generate_uuid


class NotificationModel(db.Model):
    __tablename__ = "notification_form"

    id         = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    recipient  = db.Column(db.String(32), nullable=False, index=True, comment="接收人工号")
    title      = db.Column(db.String(200), nullable=False, comment="通知标题")
    desc       = db.Column(db.String(500), default="", comment="通知描述")
    # link_type: 'review'|'project'|'duty'|'task'|''
    link_type  = db.Column(db.String(30), default="", comment="跳转类型")
    link_id    = db.Column(db.String(32), default="", comment="跳转目标ID")
    is_read    = db.Column(db.Boolean, default=False, nullable=False, comment="是否已读")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="创建时间")

    def to_dict(self):
        return {
            "id":         self.id,
            "recipient":  self.recipient,
            "title":      self.title,
            "desc":       self.desc or "",
            "link_type":  self.link_type or "",
            "link_id":    self.link_id or "",
            "is_read":    self.is_read,
            "created_at": self.created_at,
        }
