# -*- coding: utf-8 -*-
"""
@文件: function_table.py
@说明: 项目功能任务数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class FunctionDataModel(BaseMixinModel):
    """项目功能任务"""
    __tablename__ = "function_data_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    function_nm = db.Column(db.String(128), nullable=False, comment="功能名称")
    describe = db.Column(db.Text, comment="描述")
    project_id = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    responsible = db.Column(db.Text, comment="负责人工号列表(JSON数组)")
    priority = db.Column(db.Integer, default=2)
    # 0=草稿(待審核) 1=待开始 2=进行中 3=完结审核 4=已完结 8=搁置 9=删除
    function_status = db.Column(db.Integer, default=1)

    __table_args__ = (
        # 最常见过滤组合：status=1 AND function_status in (...)
        db.Index('ix_func_status_fstatus', 'status', 'function_status'),
    )
    progress = db.Column(db.Integer, default=0)
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    latest_expected_end_date = db.Column(db.String(10), comment="最新预计完成时间（延期后）")
    reschedule_count = db.Column(db.Integer, default=0, comment="延期次数")
    reschedule_log = db.Column(db.Text, comment="延期记录JSON: [{from,to,reason,date,operator}]")
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    group1 = db.Column(db.String(64), comment="功能分组1")
    group2 = db.Column(db.String(64), comment="功能分组2")
    requirement_id = db.Column(db.String(32), db.ForeignKey("requirement_form.id"), nullable=True, index=True, comment="所属需求ID（可选）")

    def to_dict(self):
        reschedule_history = []
        if self.reschedule_log:
            try:
                reschedule_history = json.loads(self.reschedule_log)
            except (ValueError, TypeError):
                pass
        return {
            "id": self.id, "function_nm": self.function_nm, "describe": self.describe or "",
            "project_id": self.project_id,
            "responsible": json.loads(self.responsible) if self.responsible else [],
            "priority": self.priority,
            "status": self.function_status, "progress": self.progress,
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.latest_expected_end_date or self.expected_end_date or "",
            "original_end_date": self.expected_end_date or "",
            "reschedule_count": self.reschedule_count or 0,
            "reschedule_history": reschedule_history,
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "group1": self.group1 or "", "group2": self.group2 or "",
            "requirement_id": self.requirement_id or "",
            "created_at": self.created_at,
        }


class ProgressRecordDataModel(BaseMixinModel):
    """项目功能进度记录"""
    __tablename__ = "progress_record_data_form"

    progress_id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), index=True)
    function_id = db.Column(db.String(32), db.ForeignKey("function_data_form.id"), nullable=False, index=True)
    progress = db.Column(db.Integer, default=0)
    progress_record = db.Column(db.Text)
    submitter = db.Column(db.String(32), nullable=False)
    cooperator = db.Column(db.Text, comment="协作人(JSON数组)")
    time_consum = db.Column(db.Float, default=0)
    is_overtime = db.Column(db.Boolean, default=False, comment="是否加班")
    overtime_hours = db.Column(db.Float, default=0, comment="加班工时")
    is_read = db.Column(db.Integer, default=0)
    files_json = db.Column(db.Text, comment="附件信息(JSON数组)")

    __table_args__ = (
        # 批量查提交人工时/进度记录（get_progress_report / get_anomalies）
        db.Index('ix_prog_rec_submitter', 'submitter'),
        # 异常检测：function_id IN [...] AND created_at >= 7天前
        db.Index('ix_prog_rec_func_created', 'function_id', 'created_at'),
    )

    def to_dict(self):
        coops = []
        if self.cooperator:
            try:
                coops = json.loads(self.cooperator)
            except Exception:
                coops = [self.cooperator]
        raw_files = []
        if self.files_json:
            try:
                raw_files = json.loads(self.files_json)
            except Exception:
                pass
        base = f"/api/project/{self.project_id}/function/{self.function_id}/progress/{self.progress_id}/files"
        files = [{"name": f["name"], "url": f"{base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
        return {
            "progress_id": self.progress_id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "is_overtime": bool(self.is_overtime), "overtime_hours": float(self.overtime_hours or 0),
            "created_at": self.created_at,
            "files": files,
        }
