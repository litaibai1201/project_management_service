# -*- coding: utf-8 -*-
"""
@文件: daily_log_table.py
@说明: 日报数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class DailyLogModel(BaseMixinModel):
    """日报"""
    __tablename__ = "daily_log_form"

    log_id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no = db.Column(db.String(32), nullable=False, index=True)
    log_date = db.Column(db.String(10), nullable=False, index=True, comment="日期(YYYY-MM-DD)")
    task_items_json = db.Column(db.Text, comment="任务条目(JSON)")
    free_items_json = db.Column(db.Text, comment="自由条目(JSON)")
    remark = db.Column(db.Text)
    log_status = db.Column(db.Integer, default=1, comment="1=草稿 2=已提交")
    total_hours = db.Column(db.Float, default=0)

    def to_summary_dict(self, user_name=None):
        return {
            "log_id": self.log_id, "work_no": self.work_no, "user_name": user_name or "",
            "log_date": self.log_date, "total_hours": self.total_hours,
            "status": self.log_status, "created_at": self.created_at,
            "updated_at": self.update_at or "",
        }

    def to_detail_dict(self, user_name=None):
        task_items, free_items = [], []
        if self.task_items_json:
            try:
                task_items = json.loads(self.task_items_json)
            except Exception:
                pass
        if self.free_items_json:
            try:
                free_items = json.loads(self.free_items_json)
            except Exception:
                pass
        return {
            "log_id": self.log_id, "work_no": self.work_no, "user_name": user_name or "",
            "log_date": self.log_date, "total_hours": self.total_hours,
            "status": self.log_status, "task_items": task_items, "free_items": free_items,
            "remark": self.remark or "", "created_at": self.created_at,
            "updated_at": self.update_at or "",
        }
