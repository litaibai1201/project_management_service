# -*- coding: utf-8 -*-
"""
@文件: duty_table.py
@说明: AR任务数据表
"""
import json

from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class TemporaryDutyModel(BaseMixinModel):
    """AR"""
    __tablename__ = "temporary_duty_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_nm = db.Column(db.String(128), nullable=False, comment="任务名称")
    describe = db.Column(db.Text)
    creator = db.Column(db.String(32), nullable=False)
    responsible = db.Column(db.Text, comment="负责人工号(JSON数组)")
    # 0=草稿 1=进行中 2=完结审核 3=已完结 8=搁置 9=删除
    duty_status = db.Column(db.Integer, default=0)

    __table_args__ = (
        # 最常见过滤组合：status=1 AND duty_status != 9
        db.Index('ix_duty_status_dstatus', 'status', 'duty_status'),
    )
    priority = db.Column(db.Integer, default=2)
    progress = db.Column(db.Integer, default=0)
    group = db.Column(db.String(64), comment="任务分组(用户自定义)")
    system_id          = db.Column(db.String(32), comment="关联系统ID")
    standalone_req_id  = db.Column(db.String(32), comment="关联独立需求ID")
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    latest_expected_end_date = db.Column(db.String(10))
    revision_count = db.Column(db.Integer, default=0)
    reschedule_log = db.Column(db.Text, comment="延期记录JSON: [{from,to,reason,date,operator}]")

    def to_dict(self):
        resp = []
        if self.responsible:
            try:
                resp = json.loads(self.responsible)
            except Exception:
                resp = [self.responsible]
        reschedule_history = []
        if self.reschedule_log:
            try:
                reschedule_history = json.loads(self.reschedule_log)
            except (ValueError, TypeError):
                pass
        return {
            "id": self.id, "duty_nm": self.duty_nm, "describe": self.describe or "",
            "creator": self.creator, "responsible": resp, "status": self.duty_status,
            "priority": self.priority, "progress": self.progress, "group": self.group or "",
            "system_id":         self.system_id or "",
            "standalone_req_id": self.standalone_req_id or "",
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.latest_expected_end_date or self.expected_end_date or "",
            "original_end_date": self.expected_end_date or "",
            "reschedule_count": self.revision_count or 0,
            "reschedule_history": reschedule_history,
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "created_at": self.created_at,
        }


class DutyProgressRecordModel(BaseMixinModel):
    """AR进度记录"""
    __tablename__ = "duty_progress_record_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_id = db.Column(db.String(32), db.ForeignKey("temporary_duty_form.id"), nullable=False, index=True)
    progress = db.Column(db.Integer, default=0)
    progress_record = db.Column(db.Text)
    submitter = db.Column(db.String(32), nullable=False)
    cooperator = db.Column(db.Text, comment="协作人(JSON数组)")
    time_consum = db.Column(db.Float, default=0)
    is_overtime = db.Column(db.Boolean, default=False, comment="是否加班")
    overtime_hours = db.Column(db.Float, default=0, comment="加班工时")
    start_time = db.Column(db.String(10))
    is_read = db.Column(db.Integer, default=0)
    files_json = db.Column(db.Text, comment="附件信息(JSON数组)")

    __table_args__ = (
        # 批量查提交人AR工时（get_progress_report）
        db.Index('ix_duty_prog_submitter', 'submitter'),
        # 日期范围过滤（get_progress_report start_date/end_date）
        db.Index('ix_duty_prog_created', 'created_at'),
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
        base = f"/api/temporary_duty/{self.duty_id}/progress/{self.id}/files"
        files = [{"name": f["name"], "url": f"{base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
        return {
            "progress_id": self.id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "is_overtime": bool(self.is_overtime), "overtime_hours": float(self.overtime_hours or 0),
            "start_time": self.start_time or "", "created_at": self.created_at,
            "files": files,
        }
