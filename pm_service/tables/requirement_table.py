# -*- coding: utf-8 -*-
"""
@文件: requirement_table.py
@说明: 专案需求数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class RequirementModel(BaseMixinModel):
    """专案需求"""
    __tablename__ = "requirement_form"

    id            = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id    = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    req_nm        = db.Column(db.String(128), nullable=False, comment="需求名称")
    describe      = db.Column(db.Text, comment="需求描述")
    priority      = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    # 0=草稿 1=审核中 2=已通过 3=已拒绝 4=已完结 8=搁置 9=已删除
    req_status    = db.Column(db.Integer, default=0, comment="需求状态")
    progress      = db.Column(db.Integer, default=0, comment="进度(0-100，由关联任务自动计算)")
    creator       = db.Column(db.String(32), comment="创建人工号")
    responsible_json  = db.Column(db.Text,       comment="负责人工号列表(JSON数组)")
    expected_benefit  = db.Column(db.Text,      comment="效益描述")
    benefit_amount    = db.Column(db.Float,      comment="预计效益数量")
    benefit_unit      = db.Column(db.String(10), default="元/年", comment="效益单位")
    files_json            = db.Column(db.Text,       comment="附件列表(JSON数组 [{name,url,size}])")
    expected_end_date     = db.Column(db.String(10), comment="预计结束日期")
    is_addon              = db.Column(db.Boolean, default=False, comment="是否追加需求(效益独立计算)")
    shelve_reason         = db.Column(db.Text, nullable=True, comment="搁置原因")
    create_stage_tasks    = db.Column(db.Boolean, default=False, comment="审核通过后是否建立阶段任务")

    def to_dict(self):
        files = []
        if self.files_json:
            try:
                files = json.loads(self.files_json)
            except Exception:
                pass
        responsible = []
        if self.responsible_json:
            try:
                responsible = json.loads(self.responsible_json)
            except Exception:
                pass
        return {
            "id":                   self.id,
            "project_id":           self.project_id,
            "req_nm":               self.req_nm,
            "describe":             self.describe or "",
            "priority":             self.priority,
            "status":               self.req_status,
            "progress":             self.progress or 0,
            "responsible":          responsible,
            "creator":              self.creator or "",
            "expected_benefit":     self.expected_benefit or "",
            "benefit_amount":       self.benefit_amount,
            "benefit_unit":         self.benefit_unit or "元/年",
            "is_addon":             bool(self.is_addon),
            "files":                files,
            "expected_end_date":    self.expected_end_date or "",
            "created_at":           self.created_at,
            "updated_at":           self.update_at or "",
            "shelve_reason":        self.shelve_reason or "",
            "create_stage_tasks":   bool(self.create_stage_tasks) if self.create_stage_tasks else False,
        }
