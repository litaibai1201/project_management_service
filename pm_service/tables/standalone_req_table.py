# -*- coding: utf-8 -*-
"""
@文件: standalone_req_table.py
@说明: 独立需求数据表
"""
import json

from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class StandaloneReqModel(BaseMixinModel):
    """独立需求（不关联专案）"""
    __tablename__ = "standalone_req_form"

    id                = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    req_nm            = db.Column(db.String(128), nullable=False, comment="需求名称")
    describe          = db.Column(db.Text, comment="需求描述")
    priority          = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    # 0=草稿 1=審核中 2=進行中 3=已拒絕 4=已完結 8=搁置 9=已刪除
    req_status        = db.Column(db.Integer, default=0, comment="需求状态")
    progress          = db.Column(db.Integer, default=0, comment="需求进度(0-100，由绑定任务自动计算)")
    system_id         = db.Column(db.String(32), nullable=False, comment="关联系统ID")
    creator           = db.Column(db.String(32), comment="创建人工号")
    reviewer           = db.Column(db.String(32), comment="审核人工号(首位)")
    reviewer_chain_json= db.Column(db.Text, comment="审核链工号JSON数组")
    responsible        = db.Column(db.Text, comment="负责人工号JSON数组")
    expected_end_date = db.Column(db.String(10), comment="预计完成日期")
    expected_benefit  = db.Column(db.Text,       comment="预估效益描述")
    benefit_amount    = db.Column(db.Float,      comment="预估效益数量")
    benefit_unit      = db.Column(db.String(10), default="元/年", comment="效益单位(元/年|人/年)")
    files_json        = db.Column(db.Text, comment="附件JSON数组")
    shelve_reason     = db.Column(db.Text, nullable=True, comment="搁置原因")
    region   = db.Column(db.String(64), comment="地区")
    campus   = db.Column(db.String(64), comment="园区")
    process  = db.Column(db.String(64), comment="制程")
    factory  = db.Column(db.String(64), comment="厂区")
    create_stage_tasks = db.Column(db.Boolean, default=False, comment="审核通过后是否建立阶段任务")
    created_at        = db.Column(db.String(19), default=CommonTools.get_now, nullable=False)
    updated_at        = db.Column(db.String(19), default=CommonTools.get_now, onupdate=CommonTools.get_now)

    __table_args__ = (
        db.Index('ix_standalone_req_creator', 'creator'),
        db.Index('ix_standalone_req_status',  'req_status'),
    )

    def to_dict(self):
        try:
            resp = json.loads(self.responsible) if self.responsible else []
        except Exception:
            resp = []
        return {
            "id":                 self.id,
            "req_nm":             self.req_nm,
            "describe":           self.describe or "",
            "priority":           self.priority,
            "status":             self.req_status,
            "system_id":          self.system_id or "",
            "creator":            self.creator or "",
            "reviewer":           self.reviewer or "",
            "reviewer_chain":     json.loads(self.reviewer_chain_json) if self.reviewer_chain_json else [],
            "responsible":        resp,
            "progress":           self.progress or 0,
            "expected_end_date":  self.expected_end_date or "",
            "expected_benefit":   self.expected_benefit or "",
            "benefit_amount":     self.benefit_amount,
            "benefit_unit":       self.benefit_unit or "元/年",
            "files":              json.loads(self.files_json) if self.files_json else [],
            "created_at":         self.created_at or "",
            "updated_at":         self.updated_at or "",
            "shelve_reason":      self.shelve_reason or "",
            "region": self.region or "", "campus": self.campus or "",
            "process": self.process or "", "factory": self.factory or "",
            "create_stage_tasks": bool(self.create_stage_tasks) if self.create_stage_tasks else False,
        }
