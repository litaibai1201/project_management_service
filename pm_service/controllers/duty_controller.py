# -*- coding: utf-8 -*-
"""临时任务控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    TemporaryDutyModel, DutyProgressRecordModel, ReviewApplyModel
)


class DutyController:

    def list_duties(self, payload: dict, work_no: str = None):
        page = payload.get("page", 1)
        size = payload.get("size", 20)
        keyword = payload.get("keyword", "")
        status = payload.get("status")
        priority = payload.get("priority")
        responsible = payload.get("responsible", "")

        q = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.duty_status != 9)
        if keyword:
            q = q.filter(TemporaryDutyModel.duty_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(TemporaryDutyModel.duty_status == status)
        if priority is not None:
            q = q.filter(TemporaryDutyModel.priority == priority)
        if responsible:
            q = q.filter(TemporaryDutyModel.responsible.like(f"%{responsible}%"))
        total = q.count()
        duties = q.order_by(TemporaryDutyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [d.to_dict() for d in duties],
        }

    def get_duty(self, duty_id: str):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        return d.to_dict()

    def create_duty(self, payload: dict, creator: str):
        resp = payload.get("responsible", [])
        d = TemporaryDutyModel(
            duty_nm=payload["duty_nm"],
            describe=payload.get("describe", ""),
            creator=creator,
            responsible=json.dumps(resp, ensure_ascii=False),
            priority=payload.get("priority", 2),
            group=payload.get("group", ""),
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
        )
        db.session.add(d)
        db.session.commit()
        return {"duty_id": d.id}

    def update_duty(self, duty_id: str, payload: dict):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        for field in ("duty_nm", "describe", "priority", "group",
                      "expected_start_date", "expected_end_date"):
            if field in payload and payload[field] is not None:
                setattr(d, field, payload[field])
        if "responsible" in payload and payload["responsible"] is not None:
            d.responsible = json.dumps(payload["responsible"], ensure_ascii=False)
        d.revision_count = (d.revision_count or 0) + 1
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def delete_duty(self, duty_id: str):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d:
            raise ResourceNotFoundException(resource_type="临时任务")
        d.duty_status = 9
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def allocate(self, duty_id: str, payload: dict):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d:
            raise ResourceNotFoundException(resource_type="临时任务")
        if payload.get("responsible"):
            d.responsible = json.dumps(payload["responsible"], ensure_ascii=False)
        if payload.get("expected_start_date"):
            d.expected_start_date = payload["expected_start_date"]
        if payload.get("expected_end_date"):
            d.expected_end_date = payload["expected_end_date"]
            d.latest_expected_end_date = payload["expected_end_date"]
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def set_status(self, duty_id: str, status: int):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d:
            raise ResourceNotFoundException(resource_type="临时任务")
        d.duty_status = status
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def get_unread_progress_count(self, work_no: str):
        count = (
            db.session.query(DutyProgressRecordModel)
            .join(TemporaryDutyModel, DutyProgressRecordModel.duty_id == TemporaryDutyModel.id)
            .filter(
                TemporaryDutyModel.creator == work_no,
                DutyProgressRecordModel.is_read == 0,
            ).count()
        )
        return {"unread_count": count}

    def get_progress(self, duty_id: str, page=1, size=20):
        q = db.session.query(DutyProgressRecordModel).filter_by(duty_id=duty_id)
        total = q.count()
        records = q.order_by(DutyProgressRecordModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }

    def create_progress(self, duty_id: str, payload: dict, submitter: str):
        rec = DutyProgressRecordModel(
            duty_id=duty_id,
            progress=payload["progress"],
            progress_record=payload.get("progress_record", ""),
            submitter=submitter,
            cooperator=json.dumps(payload.get("cooperator", []), ensure_ascii=False),
            time_consum=payload.get("time_consum", 0),
            start_time=payload.get("start_time", ""),
        )
        db.session.add(rec)
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if d:
            d.progress = payload["progress"]
            d.update_at = CommonTools.get_now()
        db.session.commit()

    def get_review_list(self, page=1, size=20, work_no=None):
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.duty_id.isnot(None))
        if work_no:
            q = q.filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }

    def approve_review(self, review_id: str, status: int, reject_reason: str = ""):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        r.apply_status = status
        r.update_at = CommonTools.get_now()
        if r.duty_id and status == 2:
            d = db.session.query(TemporaryDutyModel).filter_by(id=r.duty_id).first()
            if d:
                d.duty_status = 3  # 已完结
                d.end_time = CommonTools.get_now()
                d.update_at = CommonTools.get_now()
        db.session.commit()

    def countersign_review(self, review_id: str, approver_work_no: str, approver_name: str):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        nodes.append({
            "node_id": CommonTools.get_now().replace(" ", ""),
            "approver": approver_name,
            "approver_work_no": approver_work_no,
            "is_countersign": True,
            "status": 0,
        })
        r.approval_nodes_json = json.dumps(nodes, ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        db.session.commit()

    def get_task_list(self, work_no: str, page=1, size=20):
        q = (
            db.session.query(TemporaryDutyModel)
            .filter(
                TemporaryDutyModel.responsible.like(f"%{work_no}%"),
                TemporaryDutyModel.duty_status.in_([0, 1]),
            )
        )
        total = q.count()
        duties = q.offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [d.to_dict() for d in duties],
        }
