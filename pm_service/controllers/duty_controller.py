# -*- coding: utf-8 -*-
"""临时任务控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, PermissionException, BusinessException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    TemporaryDutyModel, DutyProgressRecordModel, ReviewApplyModel, ProjectDataModel
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
        proj_ids = [d.project_id for d in duties if d.project_id]
        proj_map = {}
        if proj_ids:
            projs = db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(proj_ids)).all()
            proj_map = {p.id: p.project_nm for p in projs}
        def _enrich(d):
            r = d.to_dict()
            r['project_nm'] = proj_map.get(d.project_id, '') if d.project_id else ''
            return r
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [_enrich(d) for d in duties],
        }

    def list_duties_by_project(self, project_id: str):
        """查询关联到某专案的所有临时任务（不含已删除）"""
        duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.project_id == project_id,
            TemporaryDutyModel.duty_status != 9,
        ).order_by(TemporaryDutyModel.created_at.desc()).all()
        return [d.to_dict() for d in duties]

    def get_duty(self, duty_id: str):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        return d.to_dict()

    def create_duty(self, payload: dict, creator: str):
        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except Exception:
                resp = [resp] if resp else []
        resp = [w.strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
        d = TemporaryDutyModel(
            duty_nm=payload["duty_nm"],
            describe=payload.get("describe", ""),
            creator=creator,
            responsible=json.dumps(resp, ensure_ascii=False),
            priority=payload.get("priority", 2),
            group=payload.get("group", ""),
            project_id=payload.get("project_id", "") or None,
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
        )
        db.session.add(d)
        db.session.commit()
        return {"duty_id": d.id}

    def update_duty(self, duty_id: str, payload: dict, work_no: str = None):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        if work_no and d.creator != work_no:
            raise PermissionException("只有建立人可以修改任務基本資訊")
        for field in ("duty_nm", "describe", "priority", "group", "project_id",
                      "expected_start_date", "expected_end_date"):
            if field in payload and payload[field] is not None:
                setattr(d, field, payload[field])
        if "responsible" in payload and payload["responsible"] is not None:
            resp = payload["responsible"]
            if isinstance(resp, str):
                try:
                    resp = json.loads(resp)
                except Exception:
                    resp = [resp] if resp else []
            resp = [w.strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
            d.responsible = json.dumps(resp, ensure_ascii=False)
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def reschedule_duty(self, duty_id: str, new_end_date: str, reason: str, operator: str):
        """延期临时任务：建立人或责任人可操作，记录延期历史"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")

        responsible = []
        if d.responsible:
            try:
                responsible = json.loads(d.responsible)
            except Exception:
                responsible = [d.responsible]

        is_creator = d.creator.lower() == operator.lower()
        is_responsible = operator.lower() in [w.lower() for w in responsible]
        if not is_creator and not is_responsible:
            raise PermissionException("只有建立人或負責人可進行延期操作")

        current_end = d.latest_expected_end_date or d.expected_end_date or ""
        history = []
        if d.reschedule_log:
            try:
                history = json.loads(d.reschedule_log)
            except (ValueError, TypeError):
                pass

        history.append({
            "from": current_end,
            "to": new_end_date,
            "reason": reason,
            "date": CommonTools.get_now()[:10],
            "operator": operator,
        })

        d.latest_expected_end_date = new_end_date
        d.revision_count = (d.revision_count or 0) + 1
        d.reschedule_log = json.dumps(history, ensure_ascii=False)
        d.update_at = CommonTools.get_now()
        db.session.commit()
        return d.to_dict()

    def delete_duty(self, duty_id: str, work_no: str = None):
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d:
            raise ResourceNotFoundException(resource_type="临时任务")
        if work_no and d.creator != work_no:
            raise PermissionException("只有建立人可以刪除任務")
        if d.duty_status not in (0, 1, 8):
            raise BusinessException("當前狀態不允許刪除")
        d.duty_status = 9
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def activate_duty(self, duty_id: str, work_no: str, payload: dict = None):
        """草稿 → 進行中（建立人）。可附帶 responsible/expected_start_date/expected_end_date 一起更新"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        responsible = json.loads(d.responsible) if d.responsible else []
        if work_no != d.creator and work_no not in responsible:
            raise PermissionException("只有建立人或負責人可以激活任務")
        if d.duty_status != 0:
            raise BusinessException("僅草稿狀態可激活")
        # 先應用傳入的補充欄位
        if payload:
            if payload.get("responsible"):
                resp = payload["responsible"]
                if isinstance(resp, list):
                    resp = [w.strip().lower() for w in resp if w]
                d.responsible = json.dumps(resp, ensure_ascii=False)
            if payload.get("expected_start_date"):
                d.expected_start_date = payload["expected_start_date"]
            if payload.get("expected_end_date"):
                d.expected_end_date = payload["expected_end_date"]
        # 驗證必填欄位
        responsible = json.loads(d.responsible) if d.responsible else []
        if not responsible:
            raise BusinessException("激活前請先指定負責人")
        if not d.expected_start_date or not d.expected_end_date:
            raise BusinessException("激活前請先設定預計開始和預計完成時間")
        d.duty_status = 1
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def hold_duty(self, duty_id: str, work_no: str):
        """進行中 → 擱置（建立人）"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        if d.creator != work_no:
            raise PermissionException("只有建立人可以擱置任務")
        if d.duty_status != 1:
            raise BusinessException("僅進行中狀態可擱置")
        d.duty_status = 8
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def resume_duty(self, duty_id: str, work_no: str):
        """擱置 → 進行中（建立人）"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        if d.creator != work_no:
            raise PermissionException("只有建立人可以恢復任務")
        if d.duty_status != 8:
            raise BusinessException("僅擱置狀態可恢復")
        d.duty_status = 1
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def submit_completion(self, duty_id: str, work_no: str, reviewer: list, submitter_name: str = ""):
        """提交完結審核：進行中 → 完結審核，建立 ReviewApplyModel"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        responsible = json.loads(d.responsible) if d.responsible else []
        if work_no not in responsible:
            raise PermissionException("只有負責人可以提交完結審核")
        if d.duty_status != 1:
            raise BusinessException("僅進行中狀態可提交完結審核")
        if not reviewer:
            raise BusinessException("請至少指定一位審核人")
        nodes = [
            {
                "node_id": f"node_{i+1}",
                "order": i + 1,
                "approver": r,
                "approver_work_no": r,
                "is_countersign": False,
                "status": 0,
                "approved_at": None,
                "comment": None,
            }
            for i, r in enumerate(reviewer)
        ]
        review = ReviewApplyModel(
            duty_id=duty_id,
            apply_type="臨時任務完結審核",
            apply_type_code="duty_completion",
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            apply_status=1,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        d.duty_status = 2
        d.update_at = CommonTools.get_now()
        db.session.add(review)
        db.session.commit()
        return {"review_id": review.id}

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

    def _duty_progress_upload_dir(self, duty_id: str, progress_id: str) -> str:
        import os
        from configs.base import BaseConfig
        base = os.path.abspath(BaseConfig.UPLOAD_DIR)
        path = os.path.join(base, "duty_progress_files", duty_id, progress_id)
        os.makedirs(path, exist_ok=True)
        return path

    def create_progress(self, duty_id: str, payload: dict, submitter: str, files=None):
        import os, uuid as _uuid
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if not d or d.duty_status == 9:
            raise ResourceNotFoundException(resource_type="临时任务")
        if d.duty_status != 1:
            raise BusinessException("只有進行中的任務才能更新進度")
        responsible = json.loads(d.responsible) if d.responsible else []
        if submitter not in responsible:
            raise PermissionException("只有負責人可以更新進度")
        progress_id = _uuid.uuid4().hex
        rec = DutyProgressRecordModel(
            id=progress_id,
            duty_id=duty_id,
            progress=payload["progress"],
            progress_record=payload.get("progress_record", ""),
            submitter=submitter,
            cooperator=json.dumps(payload.get("cooperator", []), ensure_ascii=False),
            time_consum=payload.get("time_consum", 0),
            start_time=payload.get("start_time", ""),
        )
        if files:
            from configs.base import BaseConfig
            from utils.exceptions import ValidationException
            saved = []
            upload_list = files.getlist("files") if hasattr(files, "getlist") else []
            for f_obj in upload_list:
                if not f_obj or not f_obj.filename:
                    continue
                ext = f_obj.filename.rsplit(".", 1)[-1].lower() if "." in f_obj.filename else ""
                if ext not in BaseConfig.UPLOAD_ALLOWED_EXTENSIONS:
                    raise ValidationException(msg=f"不支持的文件类型: .{ext}")
                fid = _uuid.uuid4().hex
                dest_dir = self._duty_progress_upload_dir(duty_id, progress_id)
                dest = os.path.join(dest_dir, f"{fid}.{ext}" if ext else fid)
                f_obj.save(dest)
                saved.append({"id": fid, "name": f_obj.filename, "ext": ext, "size": os.path.getsize(dest)})
            if saved:
                rec.files_json = json.dumps(saved, ensure_ascii=False)
        db.session.add(rec)
        d.progress = payload["progress"]
        d.update_at = CommonTools.get_now()
        db.session.commit()

    def get_review_list(self, page=1, size=20, work_no=None):
        from controllers.project_controller import ProjectController
        from sqlalchemy import or_
        proj_ctrl = ProjectController()
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.duty_id.isnot(None))
        if work_no:
            q = q.filter(or_(
                ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
            ))
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [proj_ctrl._enrich_review(r, viewer_work_no=work_no or "") for r in records],
        }

    def approve_review(self, review_id: str, status: int, reject_reason: str = "",
                       countersigns: list = None):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")

        now = CommonTools.get_now()

        node_status_map = {2: 1, 3: 2, 4: 3}
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        # 兼容旧数据：approval_nodes_json 为空时，从 reviewer 字段重建节点
        if not nodes and r.reviewer:
            try:
                reviewers = json.loads(r.reviewer) if isinstance(r.reviewer, str) else r.reviewer
                if isinstance(reviewers, str):
                    reviewers = [reviewers]
            except Exception:
                reviewers = []
            for i, wk in enumerate(reviewers if isinstance(reviewers, list) else []):
                nodes.append({
                    "node_id": f"legacy_{i}",
                    "order": i + 1,
                    "approver": wk,
                    "approver_work_no": wk,
                    "status": 0,
                    "is_countersign": False,
                    "approved_at": None,
                    "comment": None,
                })
        approved_order = None
        for node in sorted(nodes, key=lambda n: n.get("order", 0)):
            if node.get("status") == 0:
                node["status"]      = node_status_map.get(status, status)
                node["approved_at"] = now
                node["comment"]     = reject_reason or ""
                approved_order      = node.get("order", 0)
                break

        # 通過時若有加簽人列表，依序插入加簽節點（在剛審批的節點之後）
        cs_list = countersigns or []
        if status == 2 and cs_list and approved_order is not None:
            n_new = len(cs_list)
            insert_start = approved_order + 1
            for n in nodes:
                if n.get("order", 0) >= insert_start:
                    n["order"] = n.get("order", 0) + n_new
            for i, cs in enumerate(cs_list):
                nodes.append({
                    "node_id":          f"{CommonTools.get_now().replace(' ', '')}_{i}",
                    "order":            insert_start + i,
                    "approver":         cs.get("name", "") or cs.get("work_no", ""),
                    "approver_work_no": cs.get("work_no", ""),
                    "is_countersign":   True,
                    "status":           0,
                    "approved_at":      None,
                    "comment":          None,
                })

        r.approval_nodes_json = json.dumps(nodes, ensure_ascii=False)

        all_approved = bool(nodes) and all(n.get("status") == 1 for n in nodes)

        if status in (3, 4):
            final_status = status
        elif all_approved:
            final_status = 2
        else:
            # 还有待审节点，保持待审状态
            r.update_at = now
            db.session.commit()
            return

        r.apply_status = final_status
        r.update_at = now

        if r.duty_id and final_status == 2:
            d = db.session.query(TemporaryDutyModel).filter_by(id=r.duty_id).first()
            if d:
                d.duty_status = 3  # 已完結
                d.end_time = now
                d.update_at = now
        elif r.duty_id and final_status in (3, 4):
            d = db.session.query(TemporaryDutyModel).filter_by(id=r.duty_id).first()
            if d:
                d.duty_status = 1  # 退回進行中
                d.update_at = now
        db.session.commit()

    def countersign_review(self, review_id: str, approver_work_no: str, approver_name: str):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        # 兼容旧数据：补全缺失的 order 字段
        missing = [n for n in nodes if "order" not in n]
        if missing:
            max_order = max((n.get("order", 0) for n in nodes if "order" in n), default=0)
            for n in missing:
                max_order += 1
                n["order"] = max_order
        current_order = next(
            (n["order"] for n in sorted(nodes, key=lambda n: n["order"]) if n.get("status") == 0),
            max((n["order"] for n in nodes), default=0),
        )
        insert_order = current_order + 1
        for n in nodes:
            if n["order"] >= insert_order:
                n["order"] += 1
        nodes.append({
            "node_id": CommonTools.get_now().replace(" ", ""),
            "order": insert_order,
            "approver": approver_name,
            "approver_work_no": approver_work_no,
            "is_countersign": True,
            "status": 0,
            "approved_at": None,
            "comment": None,
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
