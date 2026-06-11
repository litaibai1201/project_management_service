# -*- coding: utf-8 -*-
"""
@文件: meeting_note_table.py
@说明: 会议备注数据表
"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import generate_uuid


class MeetingNoteModel(db.Model):
    __tablename__ = "meeting_note"

    id         = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), nullable=False, index=True, comment="所属专案ID")
    task_id    = db.Column(db.String(32), nullable=True,  index=True, comment="关联功能任务ID（可选）")
    task_name  = db.Column(db.String(128), nullable=True, comment="任务名称快照")
    note_type  = db.Column(db.String(16), nullable=False, comment="備注類型: 決策/行動項/風險/待確認")
    content    = db.Column(db.Text, nullable=False, comment="备注内容")
    author     = db.Column(db.String(32), nullable=False, comment="记录人工号")
    status     = db.Column(db.String(16), nullable=False, default="pending", comment="状态: pending/resolved")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, comment="创建时间")
    updated_at = db.Column(db.String(19), nullable=True, comment="更新时间")

    def to_dict(self, author_name: str = ""):
        return {
            "id":        self.id,
            "projectId": self.project_id,
            "taskId":    self.task_id,
            "taskName":  self.task_name,
            "type":      self.note_type,
            "content":   self.content,
            "author":    author_name or self.author,
            "status":    self.status,
            "createdAt": self.created_at,
        }
