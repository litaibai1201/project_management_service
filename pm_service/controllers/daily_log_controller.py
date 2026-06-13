# -*- coding: utf-8 -*-
"""日报控制器 — 数据存储于 MongoDB"""
import os
import uuid
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import generate_uuid, FunctionDataModel, TemporaryDutyModel
from dbs.mongo_db.client import mongo_client
from utils.exceptions import ResourceNotFoundException, BusinessException, ValidationException
from utils.auth import get_identity


def _col():
    """获取 daily_logs 集合"""
    return mongo_client.db["daily_logs"]


def _now():
    from utils.tools import CommonTools
    return CommonTools.get_now()


class DailyLogController:

    # ─── 索引初始化（应用启动时调用一次）─────────────────────────────────
    @staticmethod
    def ensure_indexes():
        col = _col()
        col.create_index("log_id", unique=True)
        col.create_index([("work_no", 1), ("log_date", 1), ("status", 1)])
        col.create_index([("task_items.task_id", 1)])
        col.create_index("log_date")

    # ─── 列表 ─────────────────────────────────────────────────────────────
    def list_logs(self, page=1, size=20, start_date=None, end_date=None,
                  work_no=None, status=None):
        target_work_no = (work_no or get_identity()).lower()
        query = {"work_no": target_work_no, "status": 1}
        if start_date:
            query.setdefault("log_date", {})["$gte"] = start_date
        if end_date:
            query.setdefault("log_date", {})["$lte"] = end_date
        if status:
            query["log_status"] = status

        total = _col().count_documents(query)
        cursor = (
            _col()
            .find(query, projection={"task_items": 0, "free_items": 0})
            .sort("log_date", -1)
            .skip((page - 1) * size)
            .limit(size)
        )
        return {
            "list": [self._to_summary(doc) for doc in cursor],
            "total": total,
            "page": page,
        }

    # ─── 詳情 ─────────────────────────────────────────────────────────────
    def get_log(self, log_id: str):
        doc = _col().find_one({"log_id": log_id, "status": 1})
        if not doc:
            raise ResourceNotFoundException(msg="日报不存在")
        return self._to_detail(doc)

    # ─── 新建 ─────────────────────────────────────────────────────────────
    def create_log(self, payload: dict):
        work_no = get_identity().lower()
        log_date = payload.get("log_date")
        if not log_date:
            raise ValidationException(msg="log_date 不能为空")

        if _col().count_documents({"work_no": work_no, "log_date": log_date, "status": 1}, limit=1):
            raise BusinessException(msg="当天已有日报，请编辑现有日报")

        task_items = payload.get("task_items", [])
        free_items = payload.get("free_items", [])
        total_hours = sum(item.get("work_hours", 0) for item in task_items + free_items)

        log_id = generate_uuid()
        now = _now()
        _col().insert_one({
            "log_id":      log_id,
            "work_no":     work_no,
            "log_date":    log_date,
            "task_items":  task_items,
            "free_items":  free_items,
            "remark":      payload.get("remark", ""),
            "log_status":  int(payload.get("status", 1)),
            "total_hours": total_hours,
            "status":      1,
            "created_at":  now,
            "updated_at":  now,
        })
        return {"log_id": log_id}

    # ─── 更新 ─────────────────────────────────────────────────────────────
    def update_log(self, log_id: str, payload: dict):
        work_no = get_identity().lower()
        doc = _col().find_one({"log_id": log_id, "work_no": work_no, "status": 1})
        if not doc:
            raise ResourceNotFoundException(msg="日报不存在")

        update_fields: dict = {"updated_at": _now()}
        if "task_items" in payload:
            update_fields["task_items"] = payload["task_items"]
        if "free_items" in payload:
            update_fields["free_items"] = payload["free_items"]
        if "remark" in payload:
            update_fields["remark"] = payload["remark"]
        if "status" in payload:
            update_fields["log_status"] = payload["status"]

        # 重算工时
        task_items = payload.get("task_items", doc.get("task_items", []))
        free_items = payload.get("free_items", doc.get("free_items", []))
        update_fields["total_hours"] = sum(item.get("work_hours", 0) for item in task_items + free_items)

        _col().update_one({"log_id": log_id}, {"$set": update_fields})
        return None

    # ─── 附件上传 ─────────────────────────────────────────────────────────
    def upload_attachments(self, log_id: str, files):
        from configs.base import BaseConfig
        doc = _col().find_one({"log_id": log_id, "status": 1})
        if not doc:
            raise ResourceNotFoundException(msg="日报不存在")

        upload_list = files.getlist("files") if hasattr(files, "getlist") else []
        saved = []
        for f_obj in upload_list:
            if not f_obj or not f_obj.filename:
                continue
            ext = f_obj.filename.rsplit(".", 1)[-1].lower() if "." in f_obj.filename else ""
            if ext not in BaseConfig.UPLOAD_ALLOWED_EXTENSIONS:
                raise ValidationException(msg=f"不支持的文件类型: .{ext}")
            fid = uuid.uuid4().hex
            dest_dir = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), "daily_log_files", log_id)
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, f"{fid}.{ext}" if ext else fid)
            f_obj.save(dest)
            file_size = os.path.getsize(dest)
            saved.append({
                "file_id":   fid,
                "file_name": f_obj.filename,
                "file_type": ext,
                "file_size": file_size,
                "url":       f"/api/daily_log/{log_id}/files/{fid}/preview",
            })
        return saved

    # ─── 附件预览 ─────────────────────────────────────────────────────────
    def get_file(self, log_id: str, file_id: str):
        from configs.base import BaseConfig
        from flask import send_from_directory
        doc = _col().find_one({"log_id": log_id, "status": 1})
        if not doc:
            raise ResourceNotFoundException(msg="日报不存在")
        dest_dir = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), "daily_log_files", log_id)
        if os.path.isdir(dest_dir):
            for fname in os.listdir(dest_dir):
                if fname.split(".")[0] == file_id:
                    return send_from_directory(dest_dir, fname)
        raise ResourceNotFoundException(msg="文件不存在")

    # ─── 日志建议（从进度记录生成）────────────────────────────────────────
    def get_suggest(self, work_no: str, date: str = None):
        from dbs.mysql_db.model_tables import (
            ProgressRecordDataModel, DutyProgressRecordModel,
            FunctionDataModel, TemporaryDutyModel, ProjectDataModel,
        )
        from sqlalchemy import or_
        import json
        if not date:
            from utils.tools import CommonTools
            date = CommonTools.get_now()[:10]

        result = []

        # ── 功能任务进度记录 ──────────────────────────────────────────────
        func_recs = (
            db.session.query(ProgressRecordDataModel)
            .filter(
                or_(
                    ProgressRecordDataModel.submitter == work_no,
                    ProgressRecordDataModel.cooperator.like(f'%"{work_no}"%'),
                ),
                ProgressRecordDataModel.created_at.like(f"{date}%"),
            ).order_by(ProgressRecordDataModel.created_at.asc()).all()
        )
        func_ids = list({r.function_id for r in func_recs})
        func_map, proj_map, req_nm_map = {}, {}, {}
        if func_ids:
            funcs = db.session.query(FunctionDataModel).filter(FunctionDataModel.id.in_(func_ids)).all()
            func_map = {f.id: f for f in funcs}
            proj_ids = list({f.project_id for f in funcs if f.project_id})
            if proj_ids:
                projs = db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(proj_ids)).all()
                proj_map = {p.id: p.project_nm for p in projs}
            req_ids = list({f.requirement_id for f in funcs if f.requirement_id})
            if req_ids:
                from dbs.mysql_db.model_tables import RequirementModel
                reqs = db.session.query(RequirementModel.id, RequirementModel.req_nm).filter(RequirementModel.id.in_(req_ids)).all()
                req_nm_map = {r.id: r.req_nm for r in reqs}
        for r in func_recs:
            func = func_map.get(r.function_id)
            try:
                raw_files = json.loads(r.files_json or "[]")
            except Exception:
                raw_files = []
            file_base = f"/api/project/{r.project_id}/function/{r.function_id}/progress/{r.progress_id}/files"
            files = [{"name": f["name"], "url": f"{file_base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
            result.append({
                "task_type":           "project",
                "task_id":             r.function_id,
                "task_nm":             func.function_nm if func else "",
                "project_id":          func.project_id if func else "",
                "project_nm":          proj_map.get(func.project_id, "") if func else "",
                "group1":              func.group1 if func else "",
                "group2":              func.group2 if func else "",
                "expected_start_date": str(func.expected_start_date) if func and func.expected_start_date else None,
                "expected_end_date":   str(func.expected_end_date) if func and func.expected_end_date else None,
                "requirement_nm":      req_nm_map.get(func.requirement_id, "") if func and func.requirement_id else None,
                "work_hours":          float(r.time_consum or 0),
                "description":         r.progress_record or "",
                "progress":            int(r.progress or 0),
                "is_overtime":         bool(r.is_overtime) if hasattr(r, 'is_overtime') else False,
                "overtime_hours":      float(r.overtime_hours or 0) if hasattr(r, 'overtime_hours') else 0,
                "files":               files,
                "suggest_id":          r.progress_id,
                "record_time":         str(r.created_at)[11:16] if r.created_at else None,
                "submitter":           r.submitter,
            })

        # ── AR进度记录 ──────────────────────────────────────────────
        duty_recs = (
            db.session.query(DutyProgressRecordModel)
            .filter(
                or_(
                    DutyProgressRecordModel.submitter == work_no,
                    DutyProgressRecordModel.cooperator.like(f'%"{work_no}"%'),
                ),
                DutyProgressRecordModel.created_at.like(f"{date}%"),
            ).order_by(DutyProgressRecordModel.created_at.asc()).all()
        )
        duty_ids = list({r.duty_id for r in duty_recs})
        duty_obj_map = {}  # duty_id → TemporaryDutyModel (for name & latest progress)
        if duty_ids:
            duties = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.id.in_(duty_ids)).all()
            duty_obj_map = {d.id: d for d in duties}
        # Batch-load system names for duties that have system_id
        from dbs.mysql_db.model_tables import SystemModel
        duty_sys_ids = list({d.system_id for d in duty_obj_map.values() if d.system_id})
        duty_sys_map = {}
        if duty_sys_ids:
            syss = db.session.query(SystemModel.id, SystemModel.sys_nm).filter(SystemModel.id.in_(duty_sys_ids)).all()
            duty_sys_map = {s.id: s.sys_nm for s in syss}
        for r in duty_recs:
            try:
                raw_files = json.loads(r.files_json or "[]")
            except Exception:
                raw_files = []
            file_base = f"/api/temporary_duty/{r.duty_id}/progress/{r.id}/files"
            files = [{"name": f["name"], "url": f"{file_base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
            duty_obj = duty_obj_map.get(r.duty_id)
            # Use the duty's current progress (TemporaryDutyModel.progress) — always the latest
            current_progress = duty_obj.progress if duty_obj else None
            system_id = duty_obj.system_id if duty_obj else None
            result.append({
                "task_type":   "duty",
                "task_id":     r.duty_id,
                "task_nm":     duty_obj.duty_nm if duty_obj else "",
                "project_nm":  None,
                "system_id":   system_id,
                "system_nm":   duty_sys_map.get(system_id, "") if system_id else None,
                "group1":      duty_obj.group if duty_obj and duty_obj.group else None,
                "work_hours":  float(r.time_consum or 0),
                "description": r.progress_record or "",
                "progress":    int(current_progress) if current_progress is not None else None,
                "is_overtime":     bool(r.is_overtime) if hasattr(r, 'is_overtime') else False,
                "overtime_hours":  float(r.overtime_hours or 0) if hasattr(r, 'overtime_hours') else 0,
                "files":       files,
                "suggest_id":  r.id,
                "record_time": str(r.created_at)[11:16] if r.created_at else None,
                "submitter":   r.submitter,
            })

        return result

    # ─── 任务关联的日志条目（供任务进度页面展示）──────────────────────────
    def get_task_entries(self, task_type: str, task_id: str):
        """
        查询某个任务在所有日志中的 manual / updated 条目，
        按 log_date 升序返回，供任务进度页面展示日志记录。
        """
        cursor = _col().find(
            {
                "task_items": {
                    "$elemMatch": {
                        "task_id":  task_id,
                        "task_type": task_type,
                        "source":   {"$in": ["manual", "updated"]},
                    }
                },
                "status": 1,
            },
            sort=[("log_date", 1)],
        )

        result = []
        for doc in cursor:
            for item in doc.get("task_items", []):
                if (
                    item.get("task_id") == task_id
                    and item.get("task_type") == task_type
                    and item.get("source") in ("manual", "updated")
                ):
                    result.append({
                        **{k: v for k, v in item.items()},
                        "log_date":   doc["log_date"],
                        "log_status": doc["log_status"],
                        "work_no":    doc["work_no"],
                    })
        return result

    # ─── 回滚任务进度（删除日志条目后调用）──────────────────────────────────
    def revert_task_progress(self, task_type: str, task_id: str):
        """
        日志条目被删除后，从进度记录表 + 剩余日志条目中取最新进度写回任务表。
        若找不到任何记录则回滚为 0。
        """
        from dbs.mysql_db.model_tables import ProgressRecordDataModel, DutyProgressRecordModel
        latest_progress = None

        if task_type == "project":
            # 从进度记录表取最新
            rec = (db.session.query(ProgressRecordDataModel.progress)
                   .filter_by(function_id=task_id)
                   .order_by(ProgressRecordDataModel.created_at.desc())
                   .first())
            if rec:
                latest_progress = int(rec.progress)
            # 从 MongoDB 日志条目取最新
            col = _col()
            pipeline = [
                {"$match": {"status": 1, "task_items.task_id": task_id}},
                {"$unwind": "$task_items"},
                {"$match": {"task_items.task_id": task_id}},
                {"$sort": {"log_date": -1, "updated_at": -1}},
                {"$limit": 1},
                {"$project": {"progress": "$task_items.progress"}},
            ]
            for doc in col.aggregate(pipeline):
                p = doc.get("progress")
                if p is not None and (latest_progress is None or int(p) > latest_progress):
                    latest_progress = int(p)

            func = db.session.query(FunctionDataModel).filter_by(id=task_id).first()
            if func:
                func.progress = latest_progress if latest_progress is not None else 0
                db.session.commit()
                # 同步需求进度
                if func.requirement_id:
                    from controllers.requirement_controller import RequirementController
                    RequirementController._sync_project_req_progress(func.requirement_id)
                    db.session.commit()

        elif task_type == "duty":
            rec = (db.session.query(DutyProgressRecordModel.progress)
                   .filter_by(duty_id=task_id)
                   .order_by(DutyProgressRecordModel.created_at.desc())
                   .first())
            if rec:
                latest_progress = int(rec.progress)
            col = _col()
            pipeline = [
                {"$match": {"status": 1, "task_items.task_id": task_id}},
                {"$unwind": "$task_items"},
                {"$match": {"task_items.task_id": task_id}},
                {"$sort": {"log_date": -1, "updated_at": -1}},
                {"$limit": 1},
                {"$project": {"progress": "$task_items.progress"}},
            ]
            for doc in col.aggregate(pipeline):
                p = doc.get("progress")
                if p is not None and (latest_progress is None or int(p) > latest_progress):
                    latest_progress = int(p)

            duty = db.session.query(TemporaryDutyModel).filter_by(id=task_id).first()
            if duty:
                duty.progress = latest_progress if latest_progress is not None else 0
                db.session.commit()
                # 同步需求进度
                if duty.standalone_req_id:
                    from controllers.duty_controller import DutyController
                    DutyController._sync_req_progress(duty.standalone_req_id)
                    db.session.commit()

    # ─── 同步任务进度字段 ─────────────────────────────────────────────────
    def sync_task_progress(self, task_type: str, task_id: str, progress: int):
        """
        将日志中用户修改的进度值直接写入任务表的 progress 字段。
        仅更新该字段，不创建进度记录，不触发审批流程。
        """
        progress = max(0, min(100, int(progress)))
        if task_type == "project":
            func = db.session.query(FunctionDataModel).filter_by(id=task_id).first()
            if not func:
                raise ResourceNotFoundException(msg="任务不存在")
            func.progress = progress
            db.session.commit()
            # 同步需求进度
            if func.requirement_id:
                from controllers.requirement_controller import RequirementController
                RequirementController._sync_project_req_progress(func.requirement_id)
                db.session.commit()
        elif task_type == "duty":
            duty = db.session.query(TemporaryDutyModel).filter_by(id=task_id).first()
            if not duty:
                raise ResourceNotFoundException(msg="AR不存在")
            duty.progress = progress
            db.session.commit()
            # 同步需求进度
            if duty.standalone_req_id:
                from controllers.duty_controller import DutyController
                DutyController._sync_req_progress(duty.standalone_req_id)
                db.session.commit()
        else:
            raise ValidationException(msg="task_type 无效")

    # ─── 内部序列化 ───────────────────────────────────────────────────────
    def _to_summary(self, doc: dict):
        return {
            "log_id":      doc["log_id"],
            "work_no":     doc["work_no"],
            "log_date":    doc["log_date"],
            "total_hours": float(doc.get("total_hours") or 0),
            "status":      doc.get("log_status", 1),
            "created_at":  doc.get("created_at"),
            "updated_at":  doc.get("updated_at"),
        }

    def _to_detail(self, doc: dict):
        base = self._to_summary(doc)
        task_items = [dict(item) for item in doc.get("task_items", [])]
        # Enrich duty task items with system_nm (backward compat: items saved before this field existed)
        duty_items_needing_sys = [
            item for item in task_items
            if item.get("task_type") == "duty" and not item.get("system_nm")
        ]
        if duty_items_needing_sys:
            duty_task_ids = list({item["task_id"] for item in duty_items_needing_sys})
            duties = db.session.query(
                TemporaryDutyModel.id, TemporaryDutyModel.system_id
            ).filter(TemporaryDutyModel.id.in_(duty_task_ids)).all()
            duty_sys_map = {d.id: d.system_id for d in duties if d.system_id}
            if duty_sys_map:
                from dbs.mysql_db.model_tables import SystemModel
                sys_ids = list(set(duty_sys_map.values()))
                syss = db.session.query(SystemModel.id, SystemModel.sys_nm).filter(SystemModel.id.in_(sys_ids)).all()
                sys_nm_map = {s.id: s.sys_nm for s in syss}
                for item in task_items:
                    if item.get("task_type") == "duty" and item.get("task_id") in duty_sys_map:
                        sys_id = duty_sys_map[item["task_id"]]
                        item["system_nm"] = sys_nm_map.get(sys_id, "")
        # Enrich project task items with requirement_nm (backward compat)
        proj_items_needing_req = [
            item for item in task_items
            if item.get("task_type") == "project" and not item.get("requirement_nm")
        ]
        if proj_items_needing_req:
            func_task_ids = list({item["task_id"] for item in proj_items_needing_req})
            funcs = db.session.query(
                FunctionDataModel.id, FunctionDataModel.requirement_id
            ).filter(FunctionDataModel.id.in_(func_task_ids)).all()
            func_req_map = {f.id: f.requirement_id for f in funcs if f.requirement_id}
            if func_req_map:
                from dbs.mysql_db.model_tables import RequirementModel
                req_ids = list(set(func_req_map.values()))
                reqs = db.session.query(RequirementModel.id, RequirementModel.req_nm).filter(RequirementModel.id.in_(req_ids)).all()
                req_nm_map = {r.id: r.req_nm for r in reqs}
                for item in task_items:
                    if item.get("task_type") == "project" and item.get("task_id") in func_req_map:
                        req_id = func_req_map[item["task_id"]]
                        item["requirement_nm"] = req_nm_map.get(req_id, "")
        # Enrich duty task items with requirement_nm (backward compat)
        duty_items_needing_req = [
            item for item in task_items
            if item.get("task_type") == "duty" and not item.get("requirement_nm")
        ]
        if duty_items_needing_req:
            duty_task_ids = list({item["task_id"] for item in duty_items_needing_req})
            duties_req = db.session.query(
                TemporaryDutyModel.id, TemporaryDutyModel.standalone_req_id
            ).filter(TemporaryDutyModel.id.in_(duty_task_ids)).all()
            duty_req_map = {d.id: d.standalone_req_id for d in duties_req if d.standalone_req_id}
            if duty_req_map:
                from dbs.mysql_db.model_tables import StandaloneReqModel
                req_ids = list(set(duty_req_map.values()))
                reqs = db.session.query(StandaloneReqModel.id, StandaloneReqModel.req_nm).filter(StandaloneReqModel.id.in_(req_ids)).all()
                req_nm_map = {r.id: r.req_nm for r in reqs}
                for item in task_items:
                    if item.get("task_type") == "duty" and item.get("task_id") in duty_req_map:
                        req_id = duty_req_map[item["task_id"]]
                        item["requirement_nm"] = req_nm_map.get(req_id, "")
        base["task_items"] = task_items
        base["free_items"] = doc.get("free_items", [])
        base["remark"]     = doc.get("remark", "")
        return base

