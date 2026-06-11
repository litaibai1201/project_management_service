# -*- coding: utf-8 -*-
"""
@文件: review_table.py
@说明: 审核申请数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class ReviewApplyModel(BaseMixinModel):
    """审核申请记录"""
    __tablename__ = "review_apply_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id     = db.Column(db.String(32), comment="关联项目ID")
    function_id    = db.Column(db.String(32), comment="关联功能ID")
    duty_id        = db.Column(db.String(32), comment="关联任务ID")
    requirement_id      = db.Column(db.String(32), comment="关联需求ID（单条）")
    requirement_ids_json = db.Column(db.Text, nullable=True, comment="批量关联需求ID列表（JSON）")
    function_ids_json   = db.Column(db.Text, nullable=True, comment="批量关联任务ID列表（JSON）")
    system_id           = db.Column(db.String(32), comment="关联系统ID（系统需求审核用）")
    apply_type = db.Column(db.String(64), comment="申请类型(中文)")
    apply_type_code = db.Column(db.String(32), comment="申请类型编码")
    submitter = db.Column(db.String(32), nullable=False, comment="提交人工号")
    submitter_name = db.Column(db.String(64), comment="提交人姓名")
    reviewer = db.Column(db.Text, comment="审核人工号(JSON数组)")
    # 1=待审 2=通过 3=拒绝 4=退回
    apply_status = db.Column(db.Integer, default=1)

    __table_args__ = (
        # 我提交的审核列表
        db.Index('ix_review_submitter', 'submitter'),
        # 专案维度查审核（get_review_list）
        db.Index('ix_review_project_status', 'project_id', 'apply_status'),
    )
    priority = db.Column(db.Integer, default=2)
    description = db.Column(db.Text)
    approval_nodes_json = db.Column(db.Text, comment="审批节点(JSON)")

    def to_dict(self, project_nm=None, function_nm=None, duty_nm=None, system_nm=None):
        nodes = []
        if self.approval_nodes_json:
            try:
                nodes = json.loads(self.approval_nodes_json)
            except Exception:
                pass
        reviewers = []
        if self.reviewer:
            try:
                reviewers = json.loads(self.reviewer)
            except Exception:
                reviewers = [self.reviewer]
        return {
            "id": self.id, "project_id": self.project_id or "",
            "function_id": self.function_id or "", "duty_id": self.duty_id or "",
            "requirement_id": self.requirement_id or "",
            "requirement_ids": json.loads(self.requirement_ids_json) if self.requirement_ids_json else [],
            "function_ids": json.loads(self.function_ids_json) if self.function_ids_json else [],
            "apply_type": self.apply_type or "", "apply_type_code": self.apply_type_code or "",
            "submitter": self.submitter, "submitter_name": self.submitter_name or "",
            "reviewer": reviewers, "status": self.apply_status, "priority": self.priority,
            "description": self.description or "", "approval_nodes": nodes,
            "created_at": self.created_at,
            "system_id": self.system_id or "",
            "project_nm": project_nm or "", "function_nm": function_nm or "",
            "duty_nm": duty_nm or "", "system_nm": system_nm or "",
        }
