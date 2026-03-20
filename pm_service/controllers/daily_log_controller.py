# -*- coding: utf-8 -*-
"""日报控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import DailyLogModel
from dbs.mysql_db.model_tables import generate_uuid
from utils.exceptions import ResourceNotFoundException, BusinessException
from utils.auth import get_identity


class DailyLogController:

    def list_logs(self, page=1, size=20, start_date=None, end_date=None,
                  work_no=None, status=None):
        """获取日报列表"""
        q = db.session.query(DailyLogModel).filter_by(status=1)
        if work_no:
            q = q.filter(DailyLogModel.work_no == work_no)
        if start_date:
            q = q.filter(DailyLogModel.log_date >= start_date)
        if end_date:
            q = q.filter(DailyLogModel.log_date <= end_date)
        if status:
            q = q.filter(DailyLogModel.log_status == status)
        total = q.count()
        logs = q.order_by(DailyLogModel.log_date.desc()).offset((page - 1) * size).limit(size).all()
        return {
            "list": [self._to_summary(lg) for lg in logs],
            "total": total,
            "page": page,
        }

    def get_log(self, log_id: str):
        """获取日报详情"""
        lg = db.session.query(DailyLogModel).filter_by(log_id=log_id, status=1).first()
        if not lg:
            raise ResourceNotFoundException(msg="日报不存在")
        return self._to_detail(lg)

    def create_log(self, payload: dict):
        """创建日报"""
        work_no = get_identity()
        # 检查当天是否已有日报
        existing = db.session.query(DailyLogModel).filter_by(
            work_no=work_no,
            log_date=payload["log_date"],
            status=1,
        ).first()
        if existing:
            raise BusinessException(msg="当天已有日报，请编辑现有日报")

        task_items = payload.get("task_items", [])
        free_items = payload.get("free_items", [])
        total_hours = sum(item.get("work_hours", 0) for item in task_items + free_items)

        lg = DailyLogModel(
            log_id=generate_uuid(),
            work_no=work_no,
            log_date=payload["log_date"],
            task_items_json=json.dumps(task_items, ensure_ascii=False),
            free_items_json=json.dumps(free_items, ensure_ascii=False),
            remark=payload.get("remark", ""),
            log_status=1,  # 草稿
            total_hours=total_hours,
        )
        db.session.add(lg)
        db.session.commit()
        return {"log_id": lg.log_id}

    def update_log(self, log_id: str, payload: dict):
        """更新日报"""
        lg = db.session.query(DailyLogModel).filter_by(log_id=log_id, status=1).first()
        if not lg:
            raise ResourceNotFoundException(msg="日报不存在")

        if "task_items" in payload:
            lg.task_items_json = json.dumps(payload["task_items"], ensure_ascii=False)
        if "free_items" in payload:
            lg.free_items_json = json.dumps(payload["free_items"], ensure_ascii=False)
        if "remark" in payload:
            lg.remark = payload["remark"]
        if "status" in payload:
            lg.log_status = payload["status"]

        # 重算工时
        task_items = json.loads(lg.task_items_json or "[]")
        free_items = json.loads(lg.free_items_json or "[]")
        lg.total_hours = sum(item.get("work_hours", 0) for item in task_items + free_items)

        db.session.commit()
        return None

    def _to_summary(self, lg: DailyLogModel):
        return {
            "log_id": lg.log_id,
            "work_no": lg.work_no,
            "log_date": str(lg.log_date) if lg.log_date else None,
            "total_hours": float(lg.total_hours) if lg.total_hours else 0,
            "status": lg.log_status,
            "created_at": str(lg.created_at) if lg.created_at else None,
            "updated_at": str(lg.update_at) if lg.update_at else None,
        }

    def _to_detail(self, lg: DailyLogModel):
        base = self._to_summary(lg)
        base["task_items"] = json.loads(lg.task_items_json or "[]")
        base["free_items"] = json.loads(lg.free_items_json or "[]")
        base["remark"] = lg.remark
        return base
