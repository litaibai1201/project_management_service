# -*- coding: utf-8 -*-
"""项目控制器"""
import json
import os

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    ProjectDataModel, ProjectGroupModel, FunctionDataModel,
    ProgressRecordDataModel, ReviewApplyModel, MilestoneModel, ProjectFileModel,
)


class ProjectController:

    # ── 文件分类权限矩阵 ────────────────────────────────────────────────────────
    # 各状态下禁止上传的文件分类（key=项目状态, value=禁止的 file_category 集合）
    _UPLOAD_LOCKED: dict = {
        2: {'requirement'},               # 立案審核中：需求文檔已鎖定
        3: {'requirement'},               # 規劃中：需求文檔已鎖定
        4: {'requirement', 'design'},     # 規劃審核中：需求+規劃鎖定
        5: {'requirement', 'design'},     # 執行中：需求+規劃鎖定（可申請变更解锁上传）
        6: {'requirement', 'design'},     # 完結審核中
        7: {'requirement', 'design'},     # 已完結
        8: {'requirement', 'design'},     # 擱置
    }
    # 各状态下禁止删除的文件分类（比上传限制更严：变更审批也不解锁删除权限）
    _DELETE_LOCKED: dict = {
        2: {'requirement'},
        3: {'requirement'},
        4: {'requirement', 'design'},
        5: {'requirement', 'design'},
        6: {'requirement', 'design'},
        7: {'requirement', 'design'},
        8: {'requirement', 'design'},
    }

    def _has_approved_change_request(self, project_id: str) -> bool:
        """检查项目是否存在已通过的需求变更申请"""
        return db.session.query(ReviewApplyModel).filter_by(
            project_id=project_id,
            apply_type_code='requirement_change',
            apply_status=2,  # 2=通过
        ).first() is not None

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

    def get_project(self, project_id: str, operator: str = ""):
        from dbs.mysql_db.model_tables import HierarchyModel
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        result = p.to_dict()
        product_pm  = p.product_pm or ""
        project_pm  = p.project_pm or ""
        is_pm = operator in (product_pm, project_pm)

        if operator and p.project_status == 1:
            # can_edit: 草稿阶段 + 操作者是产品PM或产品PM的直属上级
            if operator == product_pm:
                result["can_edit"] = True
            else:
                is_sup = db.session.query(HierarchyModel).filter_by(
                    supervisor_work_no=operator,
                    subordinate_work_no=product_pm,
                ).first() is not None
                result["can_edit"] = is_sup
        else:
            result["can_edit"] = False

        # can_submit_review: 草稿(1)阶段提交立案审核 或 规划中(3)提交规划审核
        result["can_submit_review"] = (
            p.project_status in (1, 3) and operator == product_pm
        )

        # can_manage_files: PM 在非删除状态下均可管理附件
        result["can_manage_files"] = is_pm and p.project_status not in (7, 9)

        # 需求变更申请状态
        change_req = db.session.query(ReviewApplyModel).filter_by(
            project_id=project_id,
            apply_type_code='requirement_change',
        ).order_by(ReviewApplyModel.created_at.desc()).first()
        result["change_request_status"] = change_req.apply_status if change_req else None
        result["has_approved_change_request"] = (
            change_req is not None and change_req.apply_status == 2
        )
        # can_submit_change_request: 执行中且是PM且没有待审/已通过的变更申请
        result["can_submit_change_request"] = (
            is_pm and
            p.project_status in (5, 6, 7) and
            (change_req is None or change_req.apply_status in (3, 4))  # 无申请或已被拒绝
        )
        return result

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

    def update_project(self, project_id: str, payload: dict, operator: str = ""):
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        # 只有草稿阶段允许编辑
        if p.project_status != 1:
            raise PermissionException(msg="只有草稿阶段的专案可以编辑")
        # 只有产品PM或其直属上级可以编辑
        if operator:
            product_pm = p.product_pm or ""
            if operator != product_pm:
                from dbs.mysql_db.model_tables import HierarchyModel
                is_supervisor = db.session.query(HierarchyModel).filter_by(
                    supervisor_work_no=operator,
                    subordinate_work_no=product_pm,
                ).first() is not None
                if not is_supervisor:
                    raise PermissionException(msg="只有产品PM或其直属上级可以编辑专案")
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
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        # 提交立案审核：只有产品PM可以提交，且专案必须处于草稿阶段
        if status == 2:
            if p.project_status != 1:
                raise PermissionException(msg="只有草稿阶段的专案才能提交立案审核")
            if submitter != (p.product_pm or ""):
                raise PermissionException(msg="只有产品PM可以提交立案审核")
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

    def submit_change_request(self, project_id: str, reviewer: list, description: str, submitter: str):
        """提交需求变更申请（执行阶段申请补充需求/规划文档）"""
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        if submitter not in (p.product_pm or "", p.project_pm or ""):
            raise PermissionException(msg="只有专案PM可以提交需求变更申请")
        if p.project_status not in (5, 6, 7):
            raise PermissionException(msg="只有执行阶段的专案才能提交需求变更申请")
        # 已有待审申请时不允许重复提交
        existing = db.session.query(ReviewApplyModel).filter_by(
            project_id=project_id,
            apply_type_code='requirement_change',
            apply_status=1,
        ).first()
        if existing:
            raise PermissionException(msg="已有待审核的需求变更申请，请等待审批完成")

        apply = ReviewApplyModel(
            project_id=project_id,
            apply_type="需求变更申请",
            apply_type_code="requirement_change",
            submitter=submitter,
            reviewer=json.dumps(reviewer),
            priority=p.priority,
            description=description,
        )
        db.session.add(apply)
        db.session.commit()
        return apply.to_dict()

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
        # requirement_change 审批仅更新申请记录，不影响项目状态
        if r.apply_type_code == 'requirement_change':
            db.session.commit()
            return
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

    # ── 项目附件 ──────────────────────────────────────────────────────────────

    def _upload_dir(self, project_id: str) -> str:
        from configs.base import BaseConfig
        base = os.path.abspath(BaseConfig.UPLOAD_DIR)
        path = os.path.join(base, "project_files", project_id)
        os.makedirs(path, exist_ok=True)
        return path

    def _allowed_ext(self, filename: str) -> str:
        from configs.base import BaseConfig
        from utils.exceptions import ValidationException
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in BaseConfig.UPLOAD_ALLOWED_EXTENSIONS:
            raise ValidationException(msg=f"不支持的文件类型: .{ext}")
        return ext

    def list_project_files(self, project_id: str):
        files = db.session.query(ProjectFileModel).filter_by(project_id=project_id).order_by(ProjectFileModel.created_at.desc()).all()
        return [f.to_dict() for f in files]

    def upload_project_file(self, project_id: str, file, uploader: str, file_category: str = "other"):
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        if uploader != (p.product_pm or "") and uploader != (p.project_pm or ""):
            raise PermissionException(msg="只有专案PM可以上传附件")

        valid_categories = {"requirement", "design", "progress", "other"}
        if file_category not in valid_categories:
            file_category = "other"

        # 检查当前状态对该分类是否锁定
        locked = self._UPLOAD_LOCKED.get(p.project_status, set())
        if file_category in locked:
            # 仅当存在已通过的需求变更申请时，才允许上传被锁定分类的文件
            if not self._has_approved_change_request(project_id):
                cat_label = {'requirement': '需求文件', 'design': '規劃設計'}.get(file_category, file_category)
                raise PermissionException(
                    msg=f"當前專案狀態下「{cat_label}」已鎖定，如需補充請先提交需求變更申請並獲得審批"
                )

        ext = self._allowed_ext(file.filename)
        upload_dir = self._upload_dir(project_id)
        from dbs.mysql_db.model_tables import generate_uuid
        file_id = generate_uuid()
        stored_name = f"{file_id}.{ext}"
        abs_path = os.path.join(upload_dir, stored_name)
        file.save(abs_path)
        size = os.path.getsize(abs_path)

        record = ProjectFileModel(
            id=file_id,
            project_id=project_id,
            file_nm=file.filename,
            file_path=os.path.join("project_files", project_id, stored_name),
            file_size=size,
            file_ext=ext,
            file_category=file_category,
            uploader=uploader,
        )
        db.session.add(record)
        db.session.commit()
        return record.to_dict()

    def delete_project_file(self, project_id: str, file_id: str, operator: str):
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        if operator != (p.product_pm or "") and operator != (p.project_pm or ""):
            raise PermissionException(msg="只有专案PM可以删除附件")

        # 查找文件，确认分类后检查是否锁定
        record_check = db.session.query(ProjectFileModel).filter_by(id=file_id, project_id=project_id).first()
        if record_check:
            locked = self._DELETE_LOCKED.get(p.project_status, set())
            if (record_check.file_category or 'other') in locked:
                cat_label = {'requirement': '需求文件', 'design': '規劃設計'}.get(
                    record_check.file_category, record_check.file_category)
                raise PermissionException(
                    msg=f"「{cat_label}」屬於已鎖定分類，不允許刪除原始文件"
                )

        record = db.session.query(ProjectFileModel).filter_by(id=file_id, project_id=project_id).first()
        if not record:
            raise ResourceNotFoundException(resource_type="附件")

        from configs.base import BaseConfig
        abs_path = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), record.file_path)
        if os.path.exists(abs_path):
            os.remove(abs_path)
        db.session.delete(record)
        db.session.commit()

    def get_project_file_path(self, project_id: str, file_id: str):
        from configs.base import BaseConfig
        record = db.session.query(ProjectFileModel).filter_by(id=file_id, project_id=project_id).first()
        if not record:
            raise ResourceNotFoundException(resource_type="附件")
        abs_path = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), record.file_path)
        if not os.path.exists(abs_path):
            raise ResourceNotFoundException(resource_type="附件文件")
        return abs_path, record.file_nm


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
