# -*- coding: utf-8 -*-
"""
@文件: operation_log_table.py
@说明: 操作日志数据表
"""
from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class OperationLogModel(BaseMixinModel):
    __tablename__ = "operation_log"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid, comment="UUID")
    work_no = db.Column(db.String(32), nullable=False, index=True, comment="操作人工号")
    operation = db.Column(db.String(50), nullable=False, comment="操作类型")
    target_table = db.Column(db.String(50), comment="目标表")
    target_id = db.Column(db.String(32), comment="目标记录ID")
    detail = db.Column(db.Text, comment="操作详情")

    def to_dict(self):
        return {"id": self.id, "work_no": self.work_no, "operation": self.operation,
                "target_table": self.target_table, "detail": self.detail, "created_at": self.created_at}
