# -*- coding: utf-8 -*-
"""
@文件: milestone_table.py
@说明: 项目里程碑数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class MilestoneModel(BaseMixinModel):
    """项目里程碑"""
    __tablename__ = "milestone_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    target_date = db.Column(db.String(10), nullable=False)
    milestone_status = db.Column(db.String(16), default="pending")  # pending/achieved/overdue
    note = db.Column(db.Text)
    linked_functions_json = db.Column(db.Text, comment="关联功能ID列表(JSON)")
    achieved_at = db.Column(db.String(19))
    creator = db.Column(db.String(32))

    def to_dict(self):
        linked = []
        if self.linked_functions_json:
            try:
                linked = json.loads(self.linked_functions_json)
            except Exception:
                pass
        return {
            "id": self.id, "project_id": self.project_id, "name": self.name,
            "target_date": self.target_date, "status": self.milestone_status,
            "note": self.note or "", "linked_functions": linked,
            "achieved_at": self.achieved_at or "",
        }
