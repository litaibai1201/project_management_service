# -*- coding: utf-8 -*-
"""项目控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    ProjectDataModel, ProjectGroupModel, FunctionDataModel,
    ProgressRecordDataModel, ReviewApplyModel, MilestoneModel,
)


class ProjectController:

    # ── 项目 CRUD ──────────────────────────────────────────────────────────────

    def list_projects(self, payload: dict):
        page     = payload.get("page", 1)
        size     = payload.get("size", 20)
        keyword  = payload.get("keyword", "")
        status   = payload.get("status")
        group_id = payload.get("group_id", "")
        # 参与者过滤参数
        work_no      = payload.get("work_no", "")
        manager_view = payload.get("manager_view", False)

        q = db.session.query(ProjectDataModel).filter(ProjectDataModel.project_status != 9)

        # ── 参与者过滤 ──────────────────────────────────────────────────────────
        if work_no:
            if manager_view:
                # 主管视角：自己 + 所有层级下属的参与专案
                from controllers.user_controller import UserController
                user_ctrl = UserController()
                subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
                all_members = [work_no] + [s["work_no"] for s in subordinates]
            else:
                all_members = [work_no]

            # 通过功能任务参与的专案ID
            dev_func_conds = [FunctionDataModel.developers.like(f'%"{m}"%') for m in all_members]
            dev_proj_ids = (
                db.session.query(FunctionDataModel.project_id)
                .filter(db.or_(*dev_func_conds), FunctionDataModel.function_status != 9)
                .distinct().subquery()
            )
            role_conds = [
                db.or_(
                    ProjectDataModel.project_pm == m,
                    ProjectDataModel.product_pm == m,
                    ProjectDataModel.creator    == m,
                )
                for m in all_members
            ]
            q = q.filter(db.or_(*role_conds, ProjectDataModel.id.in_(dev_proj_ids)))

        # ── 其他过滤条件 ────────────────────────────────────────────────────────
        if keyword:
            q = q.filter(ProjectDataModel.project_nm.like(f"%{keyword}%"))
        if status:
            q = q.filter(ProjectDataModel.project_status == status)
        if group_id:
            q = q.filter(ProjectDataModel.group_id == group_id)

        total = q.count()
        projects = q.order_by(ProjectDataModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "project_list": [p.to_list_item() for p in projects],
        }

    def get_project(self, project_id: str):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        return p.to_dict()

    def create_project(self, payload: dict, creator: str):
        p = ProjectDataModel(
            project_nm=payload["project_nm"],
            describe=payload.get("describe", ""),
            department=payload.get("department", ""),
            product_pm=payload.get("product_pm", ""),
            project_pm=payload["project_pm"],
            creator=creator,
            expected_end_date=payload.get("expected_end_date", ""),
            priority=payload.get("priority", 2),
            group_id=payload.get("group_id", ""),
            code_url=payload.get("code_url", ""),
            expected_benefit=payload.get("expected_benefit", ""),
        )
        db.session.add(p)
        db.session.commit()
        return {"project_id": p.id}

    def update_project(self, project_id: str, payload: dict):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        fields = ("project_nm", "describe", "department", "product_pm", "project_pm",
                  "expected_end_date", "priority", "group_id", "code_url", "expected_benefit")
        for f in fields:
            if f in payload and payload[f] is not None:
                setattr(p, f, payload[f])
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def delete_project(self, project_id: str):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        p.project_status = 9
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def set_status(self, project_id: str, status: int):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        p.project_status = status
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def submit_for_review(self, project_id: str, reviewer: list, status: int, submitter: str):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        type_map = {
            2: ("立案申请", "initiate"), 4: ("规划审核", "plan"),
            6: ("完结审核", "project_complete"),
        }
        apply_type, apply_type_code = type_map.get(status, ("状态变更", "other"))
        apply = ReviewApplyModel(
            project_id=project_id,
            apply_type=apply_type,
            apply_type_code=apply_type_code,
            submitter=submitter,
            reviewer=json.dumps(reviewer),
            priority=p.priority,
        )
        db.session.add(apply)
        p.project_status = status
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def get_gantt_chart(self, project_id: str):
        functions = (
            db.session.query(FunctionDataModel)
            .filter_by(project_id=project_id)
            .filter(FunctionDataModel.function_status != 9)
            .all()
        )
        return [f.to_dict() for f in functions]

    def get_progress_and_hour(self, project_id: str):
        funcs = (
            db.session.query(FunctionDataModel)
            .filter_by(project_id=project_id)
            .filter(FunctionDataModel.function_status != 9)
            .all()
        )
        total_hours = 0
        for f in funcs:
            hours = (
                db.session.query(db.func.sum(ProgressRecordDataModel.time_consum))
                .filter_by(function_id=f.id).scalar()
            ) or 0
            total_hours += hours
        avg_progress = (
            sum(f.progress for f in funcs) // len(funcs) if funcs else 0
        )
        return {"progress": avg_progress, "total_hours": total_hours}

    def get_member_dynamics(self, project_id: str, page=1, size=20):
        q = (
            db.session.query(ProgressRecordDataModel)
            .filter_by(project_id=project_id)
            .order_by(ProgressRecordDataModel.created_at.desc())
        )
        total = q.count()
        records = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }

    def get_project_groups(self):
        groups = db.session.query(ProjectGroupModel).filter_by(status=1).all()
        return [g.to_dict() for g in groups]

    def get_review_list(self, page=1, size=20, work_no=None):
        q = db.session.query(ReviewApplyModel).filter(
            ReviewApplyModel.duty_id.is_(None)
        )
        if work_no:
            q = q.filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }

    def get_all_reviews(self, work_no=None):
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.apply_status == 1)
        if work_no:
            q = q.filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
        return [r.to_dict() for r in q.all()]

    def approve_review(self, review_id: str, status: int, reject_reason: str = ""):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        r.apply_status = status
        r.update_at = CommonTools.get_now()
        # 同步更新项目/功能状态
        if r.project_id and not r.function_id:
            p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
            if p:
                status_map = {
                    "initiate": (2, 3), "plan": (4, 5), "project_complete": (6, 7),
                }
                next_pass, next_fail = status_map.get(r.apply_type_code or "", (None, None))
                if status == 2 and next_pass:
                    p.project_status = next_pass
                elif status in (3, 4) and next_fail:
                    p.project_status = next_fail
                p.update_at = CommonTools.get_now()
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


class FunctionController:

    def get_function(self, function_id: str):
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if not f or f.function_status == 9:
            raise ResourceNotFoundException(resource_type="功能任务")
        return f.to_dict()

    def add_function(self, project_id: str, payload: dict, creator: str):
        devs = payload.get("developers", [])
        f = FunctionDataModel(
            function_nm=payload["function_nm"],
            describe=payload.get("describe", ""),
            project_id=project_id,
            developers=json.dumps(devs, ensure_ascii=False),
            priority=payload.get("priority", 2),
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
            group1=payload.get("group1", ""),
            group2=payload.get("group2", ""),
        )
        db.session.add(f)
        db.session.commit()
        return {"function_id": f.id}

    def update_function(self, function_id: str, payload: dict):
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if not f or f.function_status == 9:
            raise ResourceNotFoundException(resource_type="功能任务")
        for field in ("function_nm", "describe", "expected_start_date", "expected_end_date",
                      "priority", "group1", "group2"):
            if field in payload and payload[field] is not None:
                setattr(f, field, payload[field])
        if "developers" in payload and payload["developers"] is not None:
            f.developers = json.dumps(payload["developers"], ensure_ascii=False)
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def delete_function(self, function_id: str):
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        f.function_status = 9
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def set_status(self, function_id: str, status: int):
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        f.function_status = status
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def allocate(self, function_id: str, payload: dict):
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        f.developers = json.dumps(payload.get("developers", []), ensure_ascii=False)
        if payload.get("expected_start_date"):
            f.expected_start_date = payload["expected_start_date"]
        if payload.get("expected_end_date"):
            f.expected_end_date = payload["expected_end_date"]
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def list_functions(self, project_id: str, payload: dict):
        page = payload.get("page", 1)
        size = payload.get("size", 20)
        keyword = payload.get("keyword", "")
        status = payload.get("status")
        q = db.session.query(FunctionDataModel).filter_by(project_id=project_id).filter(
            FunctionDataModel.function_status != 9
        )
        if keyword:
            q = q.filter(FunctionDataModel.function_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(FunctionDataModel.function_status == status)
        total = q.count()
        funcs = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [f.to_dict() for f in funcs],
        }

    def create_progress(self, project_id: str, function_id: str, payload: dict, submitter: str):
        devs = payload.get("cooperator", [])
        rec = ProgressRecordDataModel(
            project_id=project_id,
            function_id=function_id,
            progress=payload["progress"],
            progress_record=payload.get("progress_record", ""),
            submitter=submitter,
            cooperator=json.dumps(devs, ensure_ascii=False),
            time_consum=payload.get("time_consum", 0),
            start_time=payload.get("start_time", ""),
        )
        db.session.add(rec)
        f = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if f:
            f.progress = payload["progress"]
            f.update_at = CommonTools.get_now()
        db.session.commit()
        return rec.progress_id

    def get_progress(self, function_id: str, page=1, size=20, unread=0):
        q = db.session.query(ProgressRecordDataModel).filter_by(function_id=function_id)
        if unread:
            q = q.filter_by(is_read=0)
        total = q.count()
        records = q.order_by(ProgressRecordDataModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }


class MilestoneController:

    def list_milestones(self, project_id: str):
        items = db.session.query(MilestoneModel).filter_by(project_id=project_id).filter(
            MilestoneModel.status == 1
        ).all()
        return [m.to_dict() for m in items]

    def create_milestone(self, project_id: str, payload: dict, creator: str):
        m = MilestoneModel(
            project_id=project_id,
            name=payload["name"],
            target_date=payload["target_date"],
            note=payload.get("note", ""),
            linked_functions_json=json.dumps(payload.get("linked_functions", []), ensure_ascii=False),
            creator=creator,
        )
        db.session.add(m)
        db.session.commit()
        return {"milestone_id": m.id}

    def update_milestone(self, milestone_id: str, payload: dict):
        m = db.session.query(MilestoneModel).filter_by(id=milestone_id).first()
        if not m:
            raise ResourceNotFoundException(resource_type="里程碑")
        for field in ("name", "target_date", "note", "achieved_at"):
            if field in payload and payload[field] is not None:
                setattr(m, field, payload[field])
        if "status" in payload and payload["status"] is not None:
            m.milestone_status = payload["status"]
        if "linked_functions" in payload and payload["linked_functions"] is not None:
            m.linked_functions_json = json.dumps(payload["linked_functions"], ensure_ascii=False)
        m.update_at = CommonTools.get_now()
        db.session.commit()

    def delete_milestone(self, milestone_id: str):
        m = db.session.query(MilestoneModel).filter_by(id=milestone_id).first()
        if not m:
            raise ResourceNotFoundException(resource_type="里程碑")
        m.status = 0
        m.update_at = CommonTools.get_now()
        db.session.commit()
