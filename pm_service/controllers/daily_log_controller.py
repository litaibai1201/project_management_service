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
        # 若未指定 work_no，则只返回当前登录用户自己的日报
        target_work_no = work_no or get_identity()
        q = q.filter(DailyLogModel.work_no == target_work_no)
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
        work_no = get_identity()
        lg = db.session.query(DailyLogModel).filter_by(log_id=log_id, work_no=work_no, status=1).first()
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

    def get_suggest(self, work_no: str, date: str = None):
        """从当天进度记录生成日志建议条目（功能任务 + 临时任务）"""
        from dbs.mysql_db.model_tables import (
            ProgressRecordDataModel, DutyProgressRecordModel,
            FunctionDataModel, TemporaryDutyModel, ProjectDataModel,
        )
        if not date:
            from utils.tools import CommonTools
            date = CommonTools.get_now()[:10]

        result = []

        # ── 功能任务进度记录 ───────────────────────────────────────────
        func_recs = (
            db.session.query(ProgressRecordDataModel)
            .filter(
                ProgressRecordDataModel.submitter == work_no,
                ProgressRecordDataModel.created_at.like(f"{date}%"),
            ).order_by(ProgressRecordDataModel.created_at.asc()).all()
        )
        func_ids = list({r.function_id for r in func_recs})
        func_map, proj_map = {}, {}
        if func_ids:
            funcs = db.session.query(FunctionDataModel).filter(FunctionDataModel.id.in_(func_ids)).all()
            func_map = {f.id: f for f in funcs}
            proj_ids = list({f.project_id for f in funcs if f.project_id})
            if proj_ids:
                projs = db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(proj_ids)).all()
                proj_map = {p.id: p.project_nm for p in projs}
        for r in func_recs:
            func = func_map.get(r.function_id)
            # parse file attachments
            try:
                raw_files = json.loads(r.files_json or "[]")
            except Exception:
                raw_files = []
            file_base = f"/api/project/{r.project_id}/function/{r.function_id}/progress/{r.progress_id}/files"
            files = [{"name": f["name"], "url": f"{file_base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
            result.append({
                "task_type": "project",
                "task_id": r.function_id,
                "task_nm": func.function_nm if func else "",
                "project_id": func.project_id if func else "",
                "project_nm": proj_map.get(func.project_id, "") if func else "",
                "group1": func.group1 if func else "",
                "group2": func.group2 if func else "",
                "work_hours": float(r.time_consum or 0),
                "description": r.progress_record or "",
                "files": files,
                "suggest_id": r.progress_id,
                "record_time": str(r.created_at)[11:16] if r.created_at else None,
            })

        # ── 临时任务进度记录 ───────────────────────────────────────────
        duty_recs = (
            db.session.query(DutyProgressRecordModel)
            .filter(
                DutyProgressRecordModel.submitter == work_no,
                DutyProgressRecordModel.created_at.like(f"{date}%"),
            ).order_by(DutyProgressRecordModel.created_at.asc()).all()
        )
        duty_ids = list({r.duty_id for r in duty_recs})
        duty_map = {}
        if duty_ids:
            duties = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.id.in_(duty_ids)).all()
            duty_map = {d.id: d.duty_nm for d in duties}
        for r in duty_recs:
            result.append({
                "task_type": "duty",
                "task_id": r.duty_id,
                "task_nm": duty_map.get(r.duty_id, ""),
                "project_nm": None,
                "work_hours": float(r.time_consum or 0),
                "description": r.progress_record or "",
                "suggest_id": r.id,
                "record_time": str(r.created_at)[11:16] if r.created_at else None,
            })

        return result

    def _to_detail(self, lg: DailyLogModel):
        base = self._to_summary(lg)
        base["task_items"] = json.loads(lg.task_items_json or "[]")
        base["free_items"] = json.loads(lg.free_items_json or "[]")
        base["remark"] = lg.remark
        return base
