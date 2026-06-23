# -*- coding: utf-8 -*-
"""项目控制器"""
import json
import os
import uuid

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException
from utils.cache_decorator import cache_result, method_key_builder
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    ProjectDataModel, ProjectGroupModel, FunctionDataModel,
    ProgressRecordDataModel, ReviewApplyModel, MilestoneModel, ProjectFileModel,
    HierarchyModel, RequirementModel,
)
from daos.project_dao import ProjectDAO

_dao = ProjectDAO()


def _assert_project_not_in_review(project_id: str):
    """完結審核中（status=6）任何人不得修改專案內容"""
    _dao.assert_project_not_in_review(project_id)


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

    def _assert_project_not_in_review(self, project_id: str):
        """完結審核中（status=6）任何人不得修改專案內容"""
        _dao.assert_project_not_in_review(project_id)

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

            # 通过功能任务参与的专案ID（开发者 or 负责人）
            resp_func_conds = [FunctionDataModel.responsible.like(f'%"{m}"%') for m in all_members]
            func_proj_ids = (
                db.session.query(FunctionDataModel.project_id)
                .filter(
                    db.or_(*resp_func_conds),
                    FunctionDataModel.function_status != 9,
                )
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
            q = q.filter(db.or_(*role_conds, ProjectDataModel.id.in_(func_proj_ids)))

        # ── 其他过滤条件 ────────────────────────────────────────────────────────
        if keyword:
            q = q.filter(ProjectDataModel.project_nm.like(f"%{keyword}%"))
        if status:
            q = q.filter(ProjectDataModel.project_status == status)
        if group_id:
            q = q.filter(ProjectDataModel.group_id == group_id)

        total = q.count()
        projects = q.order_by(ProjectDataModel.created_at.desc()).offset((page-1)*size).limit(size).all()

        # Lazy-recalculate project progress from function data (one extra query for the whole page)
        from sqlalchemy import func as sql_func
        project_ids = [p.id for p in projects]
        if project_ids:
            rows = (
                db.session.query(
                    FunctionDataModel.project_id,
                    sql_func.avg(FunctionDataModel.progress).label('avg')
                )
                .filter(
                    FunctionDataModel.project_id.in_(project_ids),
                    FunctionDataModel.function_status != 9,
                )
                .group_by(FunctionDataModel.project_id)
                .all()
            )
            progress_map = {row.project_id: int(row.avg or 0) for row in rows}
            needs_commit = False
            for p in projects:
                calc = progress_map.get(p.id, 0)
                if p.progress != calc:
                    p.progress = calc
                    needs_commit = True
            if needs_commit:
                db.session.commit()

        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "project_list": [p.to_list_item() for p in projects],
        }

    def get_project(self, project_id: str, operator: str = ""):
        from dbs.mysql_db.model_tables import HierarchyModel
        p = _dao.find_active_project(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        result = p.to_dict()
        operator    = (operator or "").strip().lower()
        product_pm  = (p.product_pm or "").strip().lower()
        project_pm  = (p.project_pm or "").strip().lower()
        creator     = (p.creator or "").strip().lower()
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

        # can_submit_review:
        #   草稿(1)   → 只有产品PM可提交立案审核
        #   规划中(3) → 只有专案PM可提交规划审核
        #   排程安排(10)→ 只有专案PM可提交排程审核
        if p.project_status == 1:
            result["can_submit_review"] = operator == product_pm
        elif p.project_status in (3, 10):
            result["can_submit_review"] = bool(project_pm) and operator == project_pm
        else:
            result["can_submit_review"] = False

        # can_set_project_pm: 立案通过后(规划中)，若专案PM尚未设定，由创建人或产品PM设定
        result["can_set_project_pm"] = (
            p.project_status == 3 and
            not project_pm and
            operator in (creator, product_pm)
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
        from utils.exceptions import ValidationException
        if not payload.get("project_nm", "").strip():
            raise ValidationException(msg="项目名称不能为空")
        p = ProjectDataModel(
            project_nm=payload["project_nm"],
            describe=payload.get("describe", ""),
            department=payload.get("department", ""),
            product_pm=(payload.get("product_pm") or creator or "").strip().lower(),
            project_pm=(payload.get("project_pm") or "").strip().lower(),
            creator=creator,
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
            priority=payload.get("priority", 2),
            group_id=payload.get("group_id", ""),
            code_url=payload.get("code_url", ""),
            expected_benefit=payload.get("expected_benefit", ""),
            benefit_amount=payload.get("benefit_amount"),
            benefit_unit=payload.get("benefit_unit", "元/年"),
        )
        db.session.add(p)
        db.session.flush()  # get p.id before commit

        db.session.commit()
        return {"project_id": p.id}

    def update_project(self, project_id: str, payload: dict, operator: str = "", is_admin: bool = False):
        from utils.exceptions import PermissionException
        p = _dao.find_active_project(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        # is_admin 由调用方传入（管理员页面传 True）
        # 非管理员：只有草稿阶段允许编辑
        if not is_admin and p.project_status != 1:
            raise PermissionException(msg="只有草稿阶段的专案可以编辑")
        # 非管理员：只有产品PM或其直属上级可以编辑
        if not is_admin and operator:
            product_pm = p.product_pm or ""
            if operator != product_pm:
                from dbs.mysql_db.model_tables import HierarchyModel
                is_supervisor = db.session.query(HierarchyModel).filter_by(
                    supervisor_work_no=operator,
                    subordinate_work_no=product_pm,
                ).first() is not None
                if not is_supervisor:
                    raise PermissionException(msg="只有产品PM或其直属上级可以编辑专案")
        WN_FIELDS = {"product_pm", "project_pm"}
        fields = ("project_nm", "describe", "department", "product_pm", "project_pm",
                  "expected_start_date", "expected_end_date", "priority", "group_id", "code_url",
                  "expected_benefit", "benefit_amount", "benefit_unit", "actual_benefit_amount")
        for f in fields:
            if f in payload and payload[f] is not None:
                v = (payload[f] or "").strip().lower() if f in WN_FIELDS else payload[f]
                setattr(p, f, v)
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def set_project_pm(self, project_id: str, project_pm: str, operator: str):
        """规划中阶段由创建人/产品PM设定专案PM（仅在专案PM为空时允许）"""
        from utils.exceptions import PermissionException
        p = _dao.find_active_project(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        if p.project_status != 3:
            raise PermissionException(msg="只有规划中阶段可以设定专案PM")
        if p.project_pm:
            raise PermissionException(msg="专案PM已设定，如需变更请编辑专案")
        if operator not in (p.creator or "", p.product_pm or ""):
            raise PermissionException(msg="只有创建人或产品PM可以设定专案PM")
        new_pm = (project_pm or "").strip().lower()
        p.project_pm = new_pm
        p.update_at = CommonTools.get_now()
        db.session.commit()
        # 通知新設定的專案PM
        from controllers.notification_controller import push_notification
        push_notification(
            [new_pm],
            title="您已被設定為專案PM",
            desc=f"「{p.project_nm}」，請前往查看並負責後續規劃審核提交",
            link_type="project",
            link_id=project_id,
        )

    def delete_project(self, project_id: str):
        p = _dao.find_project_by_id(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        p.project_status = 9
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def set_status(self, project_id: str, status: int):
        p = _dao.find_project_by_id(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        p.project_status = status
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def submit_for_review(self, project_id: str, reviewer: list, status: int, submitter: str):
        from utils.exceptions import PermissionException
        from dbs.mysql_db.model_tables import UserProfileModel
        submitter = (submitter or "").strip().lower()
        reviewer = [(w or "").strip().lower() for w in reviewer if w]
        p = _dao.find_project_by_id(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        project_pm  = (p.project_pm  or "").strip().lower()
        product_pm  = (p.product_pm  or "").strip().lower()
        # 提交立案审核：只有产品PM可以提交，且专案必须处于草稿阶段
        if status == 2:
            if p.project_status != 1:
                raise PermissionException(msg="只有草稿阶段的专案才能提交立案审核")
            if submitter != product_pm:
                raise PermissionException(msg="只有产品PM可以提交立案审核")
        # 提交规划审核：只有专案PM可以提交，且专案必须处于规划中阶段
        if status == 4:
            if p.project_status != 3:
                raise PermissionException(msg="只有规划中阶段的专案才能提交规划审核")
            if not project_pm:
                raise PermissionException(msg="请先设定专案PM再提交规划审核")
            if submitter != project_pm:
                raise PermissionException(msg="只有专案PM可以提交规划审核")
        # 提交排程审核：只有专案PM可以提交，且专案必须处于排程安排阶段
        if status == 11:
            if p.project_status != 10:
                raise PermissionException(msg="只有排程安排阶段的专案才能提交排程审核")
            if submitter != project_pm:
                raise PermissionException(msg="只有专案PM可以提交排程审核")
        # 提交完结审核：只有专案PM可以提交，且专案必须处于执行中且整体进度达到100%
        if status == 6:
            if p.project_status != 5:
                raise PermissionException(msg="只有执行中的专案才能提交完结申请")
            if submitter != project_pm:
                raise PermissionException(msg="只有专案PM可以提交完结申请")
            if (p.progress or 0) < 100:
                raise PermissionException(msg="专案整体进度未达到100%，无法提交完结申请")
        type_map = {
            2:  ("立案申请", "initiate"),
            4:  ("规划审核", "plan"),
            11: ("排程审核", "schedule"),
            6:  ("完结审核", "project_complete"),
        }
        apply_type, apply_type_code = type_map.get(status, ("状态变更", "other"))

        # 批量查询提交人与审核人姓名（大小写不敏感）
        all_wks = list({submitter} | set(reviewer))
        all_wks_lower = [w.lower() for w in all_wks]
        wk_user_map = {
            u.work_no.lower(): u
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_(all_wks_lower)
            ).all()
        }
        submitter_profile = wk_user_map.get(submitter.lower())
        submitter_name = submitter_profile.name if submitter_profile else submitter

        # 构建初始审批节点（按传入顺序排列）
        nodes = []
        for i, reviewer_wk in enumerate(reviewer):
            u = wk_user_map.get(reviewer_wk.lower())
            nodes.append({
                "node_id": f"{CommonTools.get_now().replace(' ', '')}_{i}",
                "order": i + 1,
                "approver": u.name if u else reviewer_wk,
                "approver_work_no": reviewer_wk,
                "status": 0,
                "is_countersign": False,
                "approved_at": None,
                "comment": None,
            })

        apply = ReviewApplyModel(
            project_id=project_id,
            apply_type=apply_type,
            apply_type_code=apply_type_code,
            submitter=submitter,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer),
            priority=p.priority,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        db.session.add(apply)
        p.project_status = status
        p.update_at = CommonTools.get_now()
        db.session.commit()
        # 通知第一位審核人
        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title=f"您有新的審核申請待處理",
            desc=f"「{p.project_nm}」{apply_type}，提交人：{submitter_name}",
            link_type="review",
            link_id=apply.id,
        )

    def submit_change_request(self, project_id: str, reviewer: list, description: str, submitter: str):
        """提交需求变更申请（执行阶段申请补充需求/规划文档）"""
        from utils.exceptions import PermissionException
        submitter = (submitter or "").strip().lower()
        reviewer = [(w or "").strip().lower() for w in reviewer if w]
        p = _dao.find_active_project(project_id)
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        if submitter not in (p.product_pm or "", p.project_pm or ""):
            raise PermissionException(msg="只有专案PM可以提交需求变更申请")
        if p.project_status not in (5, 7):
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
        # 通知审核人
        from controllers.notification_controller import push_notification
        push_notification(
            recipients=reviewer,
            title="您有新的需求變更審核待處理",
            desc=f"專案「{p.project_nm}」提交了需求變更申請，請及時審核。",
            link_type="review",
            link_id=apply.id,
        )
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
        # 批量聚合所有函数工时（1 次 GROUP BY，替代 N 次 SUM 查询）
        func_ids = [f.id for f in funcs]
        total_hours = 0
        if func_ids:
            rows = db.session.query(
                ProgressRecordDataModel.function_id,
                db.func.sum(ProgressRecordDataModel.time_consum),
            ).filter(
                ProgressRecordDataModel.function_id.in_(func_ids)
            ).group_by(ProgressRecordDataModel.function_id).all()
            total_hours = sum(float(h or 0) for _, h in rows)
        avg_progress = (
            sum(f.progress for f in funcs) // len(funcs) if funcs else 0
        )
        return {"progress": avg_progress, "total_hours": total_hours}

    def get_member_dynamics(self, project_id: str, page=1, size=20):
        from dbs.mysql_db.model_tables import UserProfileModel
        q = (
            db.session.query(ProgressRecordDataModel)
            .filter_by(project_id=project_id)
            .order_by(ProgressRecordDataModel.created_at.desc())
        )
        total = q.count()
        records = q.offset((page - 1) * size).limit(size).all()
        # Build function name map for this project
        funcs = db.session.query(FunctionDataModel).filter_by(project_id=project_id).all()
        func_map = {f.id: f.function_nm for f in funcs}
        # Build user name map（批量一次查询）
        submitters = list({r.submitter for r in records if r.submitter})
        user_map = {wn.lower(): wn for wn in submitters}
        if submitters:
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in submitters])
            ).all():
                user_map[u.work_no.lower()] = u.name
        def _enrich(r):
            d = r.to_dict()
            d["operator"] = d["submitter"]
            d["operator_name"] = user_map.get((d["submitter"] or "").lower(), d["submitter"])
            d["function_nm"] = func_map.get(r.function_id, "")
            d["action"] = f"更新進度至 {d['progress']}%"
            return d
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [_enrich(r) for r in records],
        }

    def get_project_groups(self):
        groups = db.session.query(ProjectGroupModel).filter_by(status=1).all()
        return [g.to_dict() for g in groups]

    def create_project_group(self, group_nm: str) -> dict:
        from dbs.mysql_db.model_tables import generate_uuid
        g = ProjectGroupModel(id=generate_uuid(), group_nm=group_nm)
        db.session.add(g)
        db.session.commit()
        return {"id": g.id, "group_nm": g.group_nm}

    def update_project_group(self, group_id: str, group_nm: str):
        g = db.session.query(ProjectGroupModel).filter_by(id=group_id, status=1).first()
        if not g:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(msg="分组不存在")
        if group_nm:
            g.group_nm = group_nm
        db.session.commit()

    def delete_project_group(self, group_id: str):
        g = db.session.query(ProjectGroupModel).filter_by(id=group_id, status=1).first()
        if not g:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(msg="分组不存在")
        g.status = 0
        db.session.commit()

    # ─── 阶段性任务自动生成 ─────────────────────────────────────────────────
    STAGE_TASK_GROUP = "__stage__"

    STAGE_TASK_CONFIG = {
        # apply_type_code → (任务名称, 描述)
        "initiate": ("需求评估", "专案立案阶段：需求收集、可行性评估、效益分析"),
        "plan":     ("方案设计与规划", "专案规划阶段：方案设计、架构规划、资源评估、风险识别"),
        "schedule": ("排程规划与评估", "排程阶段：任务拆解、时程安排、资源分配、里程碑设定"),
    }

    def _create_stage_task(self, project_id: str, apply_type_code: str, requirement_id: str = None, req_nm: str = ""):
        """为指定需求创建阶段任务（需求级别）。requirement_id 为空时仍以专案级创建（兼容）。"""
        config = self.STAGE_TASK_CONFIG.get(apply_type_code)
        if not config:
            return
        base_name, task_desc = config
        task_name = base_name

        p = _dao.find_project_by_id(project_id)
        if not p:
            return

        # 检查是否已存在同名阶段任务（避免重复）
        q = db.session.query(FunctionDataModel).filter_by(
            project_id=project_id,
            group1=self.STAGE_TASK_GROUP,
            status=1,
        )
        if requirement_id:
            q = q.filter_by(requirement_id=requirement_id)
        q = q.filter(FunctionDataModel.function_nm.like(f"{base_name}%"))
        if q.first():
            return

        # 负责人：initiate阶段=产品PM+专案PM，其他阶段=仅专案PM
        responsible = []
        if apply_type_code == "initiate":
            if p.product_pm:
                responsible.append(p.product_pm.strip().lower())
            if p.project_pm and p.project_pm.strip().lower() not in responsible:
                responsible.append(p.project_pm.strip().lower())
        else:
            if p.project_pm:
                responsible.append(p.project_pm.strip().lower())

        f = FunctionDataModel(
            function_nm=task_name,
            describe=task_desc,
            project_id=project_id,
            requirement_id=requirement_id,
            responsible=json.dumps(responsible, ensure_ascii=False),
            priority=2,
            function_status=2,  # 直接设为进行中
            group1=self.STAGE_TASK_GROUP,
            expected_start_date=CommonTools.get_now()[:10],
        )
        db.session.add(f)
        self._pending_stage_notification = {
            "recipients": responsible,
            "task_name": task_name,
            "project_nm": p.project_nm,
            "project_id": project_id,
        }

    def _create_all_stage_tasks(self, project_id: str, requirement_id: str, req_nm: str):
        """为追加需求一次性创建所有3个阶段任务"""
        for code in ("initiate", "plan", "schedule"):
            self._create_stage_task(project_id, code, requirement_id, req_nm)

    def _create_standalone_req_stage_duties(self, req_id: str, system_id: str, req_nm: str, responsible: list):
        """为系统需求审核通过后创建3个评估与规划任务（TemporaryDutyModel）"""
        from dbs.mysql_db.model_tables import TemporaryDutyModel
        for code in ("initiate", "plan", "schedule"):
            config = self.STAGE_TASK_CONFIG.get(code)
            if not config:
                continue
            task_name, task_desc = config
            # 检查重复
            existing = db.session.query(TemporaryDutyModel).filter_by(
                standalone_req_id=req_id,
                duty_nm=task_name,
                status=1,
            ).filter(TemporaryDutyModel.duty_status != 9).first()
            if existing:
                continue
            d = TemporaryDutyModel(
                duty_nm=task_name,
                describe=task_desc,
                creator=responsible[0] if responsible else "system",
                system_id=system_id,
                standalone_req_id=req_id,
                responsible=json.dumps(responsible, ensure_ascii=False) if responsible else "[]",
                priority=2,
                duty_status=1,  # 进行中
                group=self.STAGE_TASK_GROUP,
                expected_start_date=CommonTools.get_now()[:10],
            )
            db.session.add(d)

    def _flush_stage_notification(self):
        """在 commit 后调用，发送阶段任务创建通知"""
        info = getattr(self, '_pending_stage_notification', None)
        if info and info["recipients"]:
            from controllers.notification_controller import push_notification
            push_notification(
                info["recipients"],
                title=f"您有新的评估与规划任务：{info['task_name']}",
                desc=f"专案「{info['project_nm']}」已自动创建评估与规划任务「{info['task_name']}」，您是负责人，请及时跟进。",
                link_type="project",
                link_id=info["project_id"],
            )
        self._pending_stage_notification = None

    def _enrich_review(self, r: 'ReviewApplyModel', viewer_work_no: str = "",
                       viewer_is_supervisor: bool = False) -> dict:
        """为审批记录补充关联项目/功能/任务名称及提交人姓名，并标记当前用户是否轮到审核"""
        from dbs.mysql_db.model_tables import UserProfileModel
        project_nm = function_nm = duty_nm = system_nm = None
        if r.project_id:
            p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
            project_nm = p.project_nm if p else None
        if r.function_id:
            f = db.session.query(FunctionDataModel).filter_by(id=r.function_id).first()
            function_nm = f.function_nm if f else None
        if r.duty_id:
            from dbs.mysql_db.model_tables import TemporaryDutyModel
            d = db.session.query(TemporaryDutyModel).filter_by(id=r.duty_id).first()
            duty_nm = d.duty_nm if d else None
        if r.system_id:
            from dbs.mysql_db.model_tables import SystemModel
            s = db.session.query(SystemModel).filter_by(id=r.system_id).first()
            system_nm = s.sys_nm if s else None
        result = r.to_dict(project_nm=project_nm, function_nm=function_nm, duty_nm=duty_nm, system_nm=system_nm)
        # 补充提交人姓名（始终从用户表查询最新姓名，避免存的是工号）
        u = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no) == (r.submitter or "").lower()
        ).first()
        if u:
            result["submitter_name"] = u.name
        # 老记录没有 approval_nodes 时，从 reviewer 列表构造基础节点
        if not result.get("approval_nodes"):
            reviewers = result.get("reviewer") or []
            if isinstance(reviewers, str):
                try:
                    import json as _json
                    reviewers = _json.loads(reviewers)
                except Exception:
                    reviewers = [reviewers]
            legacy_user_map = {}
            if reviewers:
                for u in db.session.query(UserProfileModel).filter(
                    db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in reviewers])
                ).all():
                    legacy_user_map[u.work_no.lower()] = u
            nodes = []
            for i, wk in enumerate(reviewers):
                u = legacy_user_map.get(wk.lower())
                nodes.append({
                    "node_id": f"legacy_{i}",
                    "order": i + 1,
                    "approver": u.name if u else wk,
                    "approver_work_no": wk,
                    "status": 1 if result.get("status") == 2 else 0,
                    "is_countersign": False,
                    "approved_at": result.get("updated_at") if result.get("status") == 2 else None,
                    "comment": None,
                })
            result["approval_nodes"] = nodes
        # 补充审批节点中的姓名（approver 可能是工号）
        if result.get("approval_nodes"):
            node_wnos = [n.get("approver_work_no") or n.get("approver", "") for n in result["approval_nodes"]]
            node_wnos_lower = [w.lower() for w in node_wnos if w]
            if node_wnos_lower:
                node_user_map = {
                    u.work_no.lower(): u.name
                    for u in db.session.query(UserProfileModel).filter(
                        db.func.lower(UserProfileModel.work_no).in_(node_wnos_lower)
                    ).all()
                }
                for n in result["approval_nodes"]:
                    wn = (n.get("approver_work_no") or n.get("approver", "")).lower()
                    if wn in node_user_map:
                        n["approver"] = node_user_map[wn]

        # 标记当前查看者是否「轮到审核」
        # 规则：（1）明确列在节点中且是当前待审节点；
        #       （2）主管查看专案完结申请时，若申请仍待审（apply_status=1），主管也可审批
        if viewer_work_no and result["approval_nodes"]:
            nodes = result["approval_nodes"]
            viewer_wn_lower = viewer_work_no.lower()
            sorted_nodes = sorted(nodes, key=lambda n: n.get("order", 0))
            first_pending = next((n for n in sorted_nodes if n.get("status") == 0), None)
            is_listed_turn = (
                first_pending is not None and
                first_pending.get("approver_work_no", "").lower() == viewer_wn_lower
            )
            # 主管对专案完结申请有额外审批权（即使未在节点列表中）
            # 但若主管已签核过（节点列表中已有其 work_no），则不重复
            already_acted = any(
                n.get("approver_work_no", "").lower() == viewer_wn_lower
                for n in nodes
            )
            is_supervisor_override = (
                viewer_is_supervisor and
                not already_acted and
                r.apply_type_code == "project_complete" and
                r.apply_status == 1 and
                first_pending is not None
            )
            result["is_my_turn"] = is_listed_turn or is_supervisor_override
        else:
            result["is_my_turn"] = False
        return result

    def _is_supervisor(self, work_no: str) -> bool:
        """检查 work_no 是否是主管（在层级表中有下属）"""
        from dbs.mysql_db.model_tables import HierarchyModel
        return db.session.query(HierarchyModel).filter_by(
            supervisor_work_no=work_no
        ).first() is not None

    def get_review_list(self, page=1, size=20, work_no=None):
        from sqlalchemy import or_
        q = db.session.query(ReviewApplyModel).filter(
            ReviewApplyModel.duty_id.is_(None)
        )
        is_sup = self._is_supervisor(work_no) if work_no else False
        if work_no:
            if is_sup:
                # 主管可以看到：（1）自己是审核人的记录，（2）所有专案完结申请
                q = q.filter(or_(
                    ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
                    ReviewApplyModel.apply_type_code == "project_complete",
                ))
            else:
                q = q.filter(or_(
                    ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
                ))
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [
                self._enrich_review(r, viewer_work_no=work_no or "", viewer_is_supervisor=is_sup)
                for r in records
            ],
        }

    def get_my_submitted_reviews(self, page=1, size=50, work_no=None):
        """返回当前用户作为提交人的所有审核记录"""
        q = db.session.query(ReviewApplyModel)
        if work_no:
            q = q.filter(ReviewApplyModel.submitter == work_no)
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [
                self._enrich_review(r, viewer_work_no=work_no or "", viewer_is_supervisor=False)
                for r in records
            ],
        }

    def get_all_reviews(self, work_no=None):
        from sqlalchemy import or_
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.apply_status == 1)
        is_sup = self._is_supervisor(work_no) if work_no else False
        if work_no:
            if is_sup:
                q = q.filter(or_(
                    ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
                    ReviewApplyModel.apply_type_code == "project_complete",
                ))
            else:
                q = q.filter(or_(
                    ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
                ))
        enriched = [
            self._enrich_review(r, viewer_work_no=work_no or "", viewer_is_supervisor=is_sup)
            for r in q.all()
        ]
        # 只返回轮到当前用户审核的记录
        return [e for e in enriched if e.get("is_my_turn")]

    def approve_review(self, review_id: str, status: int, reject_reason: str = "",
                       countersigns: list = None, approver_work_no: str = ""):
        from dbs.mysql_db.model_tables import UserProfileModel
        r = _dao.find_review_by_id(review_id)
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")

        now = CommonTools.get_now()

        # 更新当前审批节点：找到第一个 status=0（待审）的节点并记录结果
        # status 映射：2=通过→node_status=1, 3=拒绝→node_status=2, 4=退回→node_status=3
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

        # 检查审批人是否在节点列表中
        approver_in_nodes = any(
            n.get("approver_work_no") == approver_work_no
            for n in nodes
        ) if approver_work_no else True

        # 主管审批 project_complete 时不在节点中 → 插入主管节点并立即标记为已审
        if (not approver_in_nodes and approver_work_no and
                r.apply_type_code == "project_complete" and
                self._is_supervisor(approver_work_no)):
            u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first()
            max_order = max((n.get("order", 0) for n in nodes), default=0)
            nodes.append({
                "node_id":          f"sup_{CommonTools.get_now().replace(' ', '')}",
                "order":            max_order + 1,
                "approver":         u.name if u else approver_work_no,
                "approver_work_no": approver_work_no,
                "is_countersign":   False,
                "status":           node_status_map.get(status, status),
                "approved_at":      now,
                "comment":          reject_reason or "",
            })
            r.approval_nodes_json = json.dumps(nodes, ensure_ascii=False)
            r.update_at = now
            # 主管批准（status=2）→ 仅记录签核，仍等原审核人审批，不终结流程
            if status == 2:
                db.session.commit()
                return
            # 主管拒绝/退回 → 终结流程，走下方状态更新逻辑
            r.apply_status = status
            # 继续执行下方的项目状态同步

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
            # 後移現有節點，為新節點騰出位置
            for n in nodes:
                if n.get("order", 0) >= insert_start:
                    n["order"] = n.get("order", 0) + n_new
            # 依序插入加簽節點
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

        # 判断整体审批是否完成：只有所有节点通过才算完全通过，否则按操作更新状态
        # 注意：空节点列表不应被视为"全部通过"，避免无审批人时直接终结
        all_approved = bool(nodes) and all(n.get("status") == 1 for n in nodes)

        # 确定最终审批状态
        if status in (3, 4):
            # 拒绝/退回 → 立即结束
            final_status = status
        elif all_approved:
            # 全部通过
            final_status = 2
        else:
            # 还有待审节点，保持待审状态
            r.update_at = now
            db.session.commit()
            # 通知下一位待審核人
            from controllers.notification_controller import push_notification
            next_node = next(
                (n for n in sorted(nodes, key=lambda n: n.get("order", 0)) if n.get("status") == 0),
                None,
            )
            if next_node:
                _sub_u = db.session.query(UserProfileModel).filter(
                    db.func.lower(UserProfileModel.work_no) == (r.submitter or "").lower()
                ).first()
                submitter_display = (_sub_u.name if _sub_u else None) or r.submitter_name or r.submitter or ""
                push_notification(
                    [next_node["approver_work_no"]],
                    title="您有新的審核申請待處理",
                    desc=f"「{r.apply_type}」輪到您審核，提交人：{submitter_display}，請前往審核管理查看",
                    link_type="review",
                    link_id=review_id,
                )
            return

        r.apply_status = final_status
        r.update_at = now

        # requirement_change 审批仅更新申请记录，不影响项目状态
        if r.apply_type_code == 'requirement_change':
            db.session.commit()
            return

        # requirement_review / requirement_shelve 审批更新需求状态
        if r.apply_type_code in ('requirement_review', 'requirement_shelve') and r.requirement_id:
            from dbs.mysql_db.model_tables import RequirementModel, UserProfileModel
            req = db.session.query(RequirementModel).filter_by(id=r.requirement_id).first()
            if req:
                if r.apply_type_code == 'requirement_review':
                    if final_status == 2:         # 通過 → 已通過
                        req.req_status = 2
                        # 追加需求审核通过 → 一次性创建3个阶段任务
                        self._create_all_stage_tasks(r.project_id, req.id, req.req_nm)
                    elif final_status in (3, 4):  # 拒絕/退回 → 草稿
                        req.req_status = 0
                else:  # requirement_shelve
                    if final_status == 2:         # 通過 → 搁置
                        req.req_status = 8
                    # 拒絕/退回 → 需求狀態不變（仍是已通過）
                req.update_at = now
            db.session.commit()
            self._flush_stage_notification()

            # 取得上下文資訊
            proj = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first() if r.project_id else None
            proj_nm = proj.project_nm if proj else ""
            approver_u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
            approver_nm = approver_u.name if approver_u else approver_work_no
            responsible = []
            if req and req.responsible_json:
                try:
                    responsible = json.loads(req.responsible_json)
                except Exception:
                    pass

            from controllers.notification_controller import push_notification
            result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
            type_text = "搁置申請" if r.apply_type_code == 'requirement_shelve' else "審核申請"
            notif_desc = f"【{proj_nm}】需求「{r.description}」{type_text}{result_text}，審核人：{approver_nm}"
            push_notification(
                [r.submitter],
                title=f"您的需求{type_text}{result_text}",
                desc=notif_desc,
                link_type="project",
                link_id=r.project_id or "",
            )
            extra = [w for w in responsible if w != r.submitter]
            if extra:
                push_notification(
                    extra,
                    title=f"需求{type_text}{result_text}",
                    desc=notif_desc,
                    link_type="project",
                    link_id=r.project_id or "",
                )
            return

        # requirement_batch_review 批量需求审批
        if r.apply_type_code == 'requirement_batch_review' and r.requirement_ids_json:
            import json as _json
            from dbs.mysql_db.model_tables import RequirementModel, UserProfileModel
            req_ids = []
            try:
                req_ids = _json.loads(r.requirement_ids_json)
            except Exception:
                pass
            reqs = []
            if req_ids:
                reqs = db.session.query(RequirementModel).filter(
                    RequirementModel.id.in_(req_ids)
                ).all()
                for req in reqs:
                    if final_status == 2:
                        req.req_status = 2
                    elif final_status in (3, 4):
                        req.req_status = 0
                    req.update_at = now
            db.session.commit()

            proj = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first() if r.project_id else None
            proj_nm = proj.project_nm if proj else ""
            approver_u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
            approver_nm = approver_u.name if approver_u else approver_work_no
            # 彙整所有需求負責人
            all_resp: set = set()
            for req in reqs:
                if req.responsible_json:
                    try:
                        all_resp.update(json.loads(req.responsible_json))
                    except Exception:
                        pass

            from controllers.notification_controller import push_notification
            result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
            notif_desc = f"【{proj_nm}】{len(reqs)} 條需求批量審核{result_text}，審核人：{approver_nm}"
            push_notification(
                [r.submitter],
                title=f"您的需求批量審核申請{result_text}",
                desc=notif_desc,
                link_type="project",
                link_id=r.project_id or "",
            )
            extra = [w for w in all_resp if w != r.submitter]
            if extra:
                push_notification(
                    extra,
                    title=f"需求批量審核{result_text}",
                    desc=notif_desc,
                    link_type="project",
                    link_id=r.project_id or "",
                )
            return

        # standalone_req_review 系統需求審核（單條）
        if r.apply_type_code == 'standalone_req_review' and r.requirement_id:
            from dbs.mysql_db.model_tables import StandaloneReqModel, SystemModel, UserProfileModel
            req = db.session.query(StandaloneReqModel).filter_by(id=r.requirement_id).first()
            responsible = []
            if req:
                if final_status == 2:
                    req.req_status = 2
                    # 系统需求审核通过 → 创建3个评估与规划任务
                    if req.responsible:
                        try:
                            responsible = json.loads(req.responsible)
                        except Exception:
                            pass
                    self._create_standalone_req_stage_duties(
                        req.id, r.system_id or "", req.req_nm, responsible
                    )
                elif final_status in (3, 4):
                    req.req_status = 0
                req.updated_at = now
            db.session.commit()
            # 系统需求审批通过后：强制重置进度为0并同步（stage tasks 刚创建，进度一定是0）
            if req and final_status == 2:
                req.progress = 0
                req.req_status = 2
                db.session.commit()

            sys_obj = db.session.query(SystemModel).filter_by(id=r.system_id).first() if r.system_id else None
            sys_nm = sys_obj.sys_nm if sys_obj else ""
            approver_u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
            approver_nm = approver_u.name if approver_u else approver_work_no

            from controllers.notification_controller import push_notification
            result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
            notif_desc = f"【{sys_nm}】系統需求「{r.description}」審核{result_text}，審核人：{approver_nm}" if sys_nm else f"系統需求「{r.description}」審核{result_text}，審核人：{approver_nm}"
            push_notification(
                [r.submitter],
                title=f"您的系統需求審核申請{result_text}",
                desc=notif_desc,
                link_type="review",
                link_id=review_id,
            )
            if not responsible and req and req.responsible:
                try:
                    responsible = json.loads(req.responsible)
                except Exception:
                    pass
            extra = [w for w in responsible if w != r.submitter]
            if extra:
                push_notification(
                    extra,
                    title=f"系統需求審核{result_text}",
                    desc=notif_desc,
                    link_type="review",
                    link_id=review_id,
                )
            return

        # standalone_req_batch_review 系統需求批量審核
        if r.apply_type_code == 'standalone_req_batch_review' and r.requirement_ids_json:
            import json as _json
            from dbs.mysql_db.model_tables import StandaloneReqModel, SystemModel, UserProfileModel
            try:
                req_ids = _json.loads(r.requirement_ids_json)
            except Exception:
                req_ids = []
            reqs = []
            if req_ids:
                reqs = db.session.query(StandaloneReqModel).filter(
                    StandaloneReqModel.id.in_(req_ids)
                ).all()
                for req in reqs:
                    if final_status == 2:
                        req.req_status = 2
                        # 系统需求审核通过 → 创建3个评估与规划任务
                        resp_list = []
                        if req.responsible:
                            try:
                                resp_list = json.loads(req.responsible)
                            except Exception:
                                pass
                        self._create_standalone_req_stage_duties(
                            req.id, r.system_id or "", req.req_nm, resp_list
                        )
                    elif final_status in (3, 4):
                        req.req_status = 0
                    req.updated_at = now
            db.session.commit()
            # 系统需求批量审批通过后：强制重置进度为0（stage tasks 刚创建）
            if final_status == 2:
                for req in reqs:
                    req.progress = 0
                    req.req_status = 2
                db.session.commit()

            sys_obj = db.session.query(SystemModel).filter_by(id=r.system_id).first() if r.system_id else None
            sys_nm = sys_obj.sys_nm if sys_obj else ""
            approver_u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
            approver_nm = approver_u.name if approver_u else approver_work_no
            all_resp: set = set()
            for req in reqs:
                if req.responsible:
                    try:
                        all_resp.update(json.loads(req.responsible))
                    except Exception:
                        pass

            from controllers.notification_controller import push_notification
            result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
            notif_desc = f"【{sys_nm}】{len(reqs)} 條系統需求批量審核{result_text}，審核人：{approver_nm}" if sys_nm else f"{len(reqs)} 條系統需求批量審核{result_text}，審核人：{approver_nm}"
            push_notification(
                [r.submitter],
                title=f"您的系統需求批量審核申請{result_text}",
                desc=notif_desc,
                link_type="review",
                link_id=review_id,
            )
            extra = [w for w in all_resp if w != r.submitter]
            if extra:
                push_notification(
                    extra,
                    title=f"系統需求批量審核{result_text}",
                    desc=notif_desc,
                    link_type="review",
                    link_id=review_id,
                )
            return

        # task_addition_review 執行階段新增任務審批
        if r.apply_type_code == 'task_addition_review' and r.function_ids_json:
            func_ids = []
            try:
                func_ids = json.loads(r.function_ids_json)
            except Exception:
                pass
            if func_ids:
                funcs = db.session.query(FunctionDataModel).filter(
                    FunctionDataModel.id.in_(func_ids)
                ).all()
                for func in funcs:
                    if final_status == 2:       # 通過 → 待開始
                        func.function_status = 1
                    elif final_status in (3, 4): # 拒絕/退回 → 保留草稿
                        func.function_status = 0
                    func.update_at = now
            db.session.commit()
            from controllers.notification_controller import push_notification
            result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
            if final_status == 2:
                # 通知所有任務負責人
                all_resp = set()
                for func in funcs:
                    if func.responsible:
                        try:
                            for w in json.loads(func.responsible):
                                if w and w != r.submitter:
                                    all_resp.add(w)
                        except Exception:
                            pass
                if all_resp:
                    proj = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
                    proj_nm = proj.project_nm if proj else ""
                    push_notification(
                        list(all_resp),
                        title="您已被指派為功能任務負責人",
                        desc=f"專案「{proj_nm}」有新任務已審核通過，請及時跟進。",
                        link_type="project",
                        link_id=r.project_id or "",
                    )
            _proj = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first() if r.project_id else None
            _proj_nm = _proj.project_nm if _proj else ""
            _approver_u = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
            _approver_nm = _approver_u.name if _approver_u else approver_work_no
            push_notification(
                [r.submitter],
                title=f"您的任務新增審核申請{result_text}",
                desc=f"【{_proj_nm}】新增任務審核申請{result_text}，審核人：{_approver_nm}" if _proj_nm else f"新增任務審核申請{result_text}，審核人：{_approver_nm}",
                link_type="project",
                link_id=r.project_id or "",
            )
            return

        # req_task_addition_review 需求任務新增審批
        if r.apply_type_code == 'req_task_addition_review' and r.function_ids_json:
            duty_ids = []
            try:
                duty_ids = json.loads(r.function_ids_json)
            except Exception:
                pass
            if duty_ids:
                from dbs.mysql_db.model_tables import TemporaryDutyModel, SystemModel
                duties = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.id.in_(duty_ids)).all()
                for d in duties:
                    if final_status == 2:        # 通過 → 未開始（首次更新進度後才變進行中）
                        d.duty_status = 6
                    elif final_status in (3, 4): # 拒絕/退回 → 草稿
                        d.duty_status = 0
                    d.updated_at = now
                db.session.commit()
                from controllers.notification_controller import push_notification
                result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
                sys_nm = ""
                if r.system_id:
                    sys_obj = db.session.query(SystemModel).filter_by(id=r.system_id).first()
                    sys_nm = sys_obj.sys_nm if sys_obj else ""
                if final_status == 2:
                    all_resp = set()
                    for d in duties:
                        if d.responsible:
                            try:
                                for w in json.loads(d.responsible):
                                    if w and w != r.submitter:
                                        all_resp.add(str(w))
                            except Exception:
                                pass
                    if all_resp:
                        push_notification(
                            list(all_resp),
                            title="您已被指派為需求任務負責人",
                            desc=f"系統「{sys_nm}」有新需求任務已審核通過，請及時跟進。",
                            link_type="system",
                            link_id=r.system_id or "",
                        )
                push_notification(
                    [r.submitter],
                    title=f"您的需求任務新增審核申請{result_text}",
                    desc=f"系統「{sys_nm}」需求任務新增審核申請{result_text}",
                    link_type="system",
                    link_id=r.system_id or "",
                )
            return

        # 同步更新功能任务状态（function_complete）
        # 项目状态码: 1=草稿 2=立案審核 3=規劃中 4=規劃審核 5=執行中 6=完結審核 7=完結
        # 功能状态码: 0=草稿 1=待開始 2=進行中 3=完結審核 4=已完結
        if r.function_id:
            func = db.session.query(FunctionDataModel).filter_by(id=r.function_id).first()
            if func:
                if final_status == 2:        # 通過 → 已完結
                    func.function_status = 4
                    func.end_time = now[:10]
                elif final_status in (3, 4):  # 拒絕/退回 → 退回進行中
                    func.function_status = 2
                func.update_at = now
                # Recalculate project overall progress
                if r.project_id:
                    active_funcs = db.session.query(FunctionDataModel).filter_by(project_id=r.project_id).filter(
                        FunctionDataModel.function_status != 9
                    ).all()
                    proj = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
                    if active_funcs and proj:
                        proj.progress = sum(fn.progress or 0 for fn in active_funcs) // len(active_funcs)
                        proj.update_at = now
                # Sync requirement progress if this function belongs to a requirement
                if func.requirement_id:
                    from controllers.requirement_controller import RequirementController
                    RequirementController._sync_project_req_progress(func.requirement_id)
        # 同步更新专案状态（仅专案级别的申请）
        elif r.project_id:
            p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
            if p:
                # (通過後的狀態, 拒絕/退回後的狀態)
                project_status_map = {
                    "initiate":         (3,  1),   # 通過→規劃中(3),   拒絕→草稿(1)
                    "plan":             (10, 3),   # 通過→排程安排(10),拒絕→規劃中(3)
                    "schedule":         (5,  10),  # 通過→執行中(5),   拒絕→排程安排(10)
                    "project_complete": (7,  5),   # 通過→完結(7),     拒絕→執行中(5)
                }
                next_pass, next_fail = project_status_map.get(r.apply_type_code or "", (None, None))
                if final_status == 2 and next_pass:
                    p.project_status = next_pass
                    # 完結審核通過 → 記錄實際完結時間
                    if r.apply_type_code == 'project_complete':
                        p.end_time = now[:10]
                    # 立案審核通過 → 專案進入規劃中，自動核准所有草稿需求
                    if r.apply_type_code == 'initiate':
                        from dbs.mysql_db.model_tables import RequirementModel
                        draft_reqs = db.session.query(RequirementModel).filter_by(
                            project_id=r.project_id, req_status=0
                        ).all()
                        for req in draft_reqs:
                            req.req_status = 2
                            req.update_at = now
                    # 审核通过 → 需求级阶段任务处理
                    # 当前阶段的阶段任务标记完成 + 为每个需求创建下一阶段任务
                    next_stage_map = {"initiate": "plan", "plan": "schedule"}
                    current_stage = r.apply_type_code  # initiate / plan / schedule
                    next_stage = next_stage_map.get(current_stage)
                    current_base_name = self.STAGE_TASK_CONFIG.get(current_stage, ("",))[0]

                    # 完成当前阶段的所有需求级阶段任务
                    current_tasks = db.session.query(FunctionDataModel).filter_by(
                        project_id=r.project_id,
                        group1=self.STAGE_TASK_GROUP,
                        status=1,
                    ).filter(
                        FunctionDataModel.function_status != 4,
                        FunctionDataModel.function_nm.like(f"{current_base_name}%"),
                    ).all()
                    for pt in current_tasks:
                        pt.function_status = 4
                        pt.progress = 100
                        pt.end_time = now[:10]

                    # 为每个需求创建下一阶段的任务
                    if next_stage:
                        from dbs.mysql_db.model_tables import RequirementModel as _RM
                        reqs = db.session.query(_RM).filter(
                            _RM.project_id == r.project_id,
                            _RM.req_status.in_([0, 2, 4]),  # 草稿、已通过、已完结（阶段任务完成导致的）
                        ).all()
                        # 创建新阶段任务后，将已完结的需求恢复为进行中
                        for req in reqs:
                            if req.req_status == 4:
                                req.req_status = 2
                                req.update_at = now
                        for req in reqs:
                            self._create_stage_task(r.project_id, next_stage, req.id, req.req_nm)
                elif final_status in (3, 4) and next_fail:
                    p.project_status = next_fail
                p.update_at = now
        db.session.commit()
        self._flush_stage_notification()
        # 通知提交人審核結果
        from controllers.notification_controller import push_notification
        result_text = "已通過" if final_status == 2 else ("已被退回" if final_status == 4 else "已被拒絕")
        _approver_u2 = db.session.query(UserProfileModel).filter_by(work_no=approver_work_no).first() if approver_work_no else None
        _approver_nm2 = _approver_u2.name if _approver_u2 else approver_work_no
        _ctx2 = ""
        if r.project_id:
            _p2 = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
            if _p2:
                _ctx2 = f"【{_p2.project_nm}】"
        push_notification(
            [r.submitter],
            title=f"您的申請{result_text}",
            desc=f"{_ctx2}「{r.apply_type}」{result_text}，審核人：{_approver_nm2}",
            link_type="project" if r.project_id else "duty",
            link_id=r.project_id or r.duty_id or "",
        )

    def countersign_review(self, review_id: str, approver_work_no: str, approver_name: str):
        approver_work_no = (approver_work_no or "").strip().lower()
        r = _dao.find_review_by_id(review_id)
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        # 兼容旧数据：补全缺失的 order 字段，按现有顺序依次赋值
        missing = [n for n in nodes if "order" not in n]
        if missing:
            max_order = max((n.get("order", 0) for n in nodes if "order" in n), default=0)
            for n in missing:
                max_order += 1
                n["order"] = max_order
        # 加签节点插入到当前待审节点之后
        current_order = next(
            (n["order"] for n in sorted(nodes, key=lambda n: n["order"]) if n.get("status") == 0),
            max((n["order"] for n in nodes), default=0),
        )
        insert_order = current_order + 1
        # 后续节点 order 后移
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
        import json
        files = db.session.query(ProjectFileModel).filter_by(project_id=project_id).order_by(ProjectFileModel.created_at.desc()).all()
        result = [f.to_dict() for f in files]

        # 将需求附件合并进来，标记 source='requirement_attachment'
        reqs = (
            db.session.query(RequirementModel)
            .filter_by(project_id=project_id)
            .filter(RequirementModel.req_status != 9)
            .all()
        )
        for req in reqs:
            if not req.files_json:
                continue
            try:
                req_files = json.loads(req.files_json)
            except Exception:
                req_files = []
            for f in req_files:
                file_id = f.get('file_id')
                if not file_id:
                    continue
                name = f.get('name', '')
                ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
                result.append({
                    'id': file_id,
                    'project_id': project_id,
                    'file_nm': name,
                    'file_size': f.get('size', 0),
                    'file_ext': ext,
                    'file_category': 'requirement',
                    'uploader': req.creator or '',
                    'created_at': req.update_at or req.created_at or '',
                    'req_id': req.id,
                    'req_nm': req.req_nm or '',
                    'source': 'requirement_attachment',
                })

        return result

    def upload_project_file(self, project_id: str, file, uploader: str, file_category: str = "other"):
        from utils.exceptions import PermissionException
        self._assert_project_not_in_review(project_id)
        p = _dao.find_active_project(project_id)
        if not p:
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
        self._assert_project_not_in_review(project_id)
        p = _dao.find_active_project(project_id)
        if not p:
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

    def get_wbs_overview(self, work_no: str) -> list:
        """
        专案进度总览（WBS 结构）
        返回当前用户参与的所有活跃专案，按 project → function_group → function 三层结构
        """
        from datetime import datetime, timedelta
        from dbs.mysql_db.model_tables import UserProfileModel

        today = datetime.today().date()
        this_week_start = today - timedelta(days=today.weekday())
        this_week_end   = this_week_start + timedelta(days=6)
        last_week_start = this_week_start - timedelta(days=7)
        last_week_end   = this_week_start - timedelta(days=1)
        next_week_start = this_week_end   + timedelta(days=1)
        next_week_end   = next_week_start + timedelta(days=6)

        # ── 拉取所有活跃专案（草稿~完结审核，包含阶段任务的早期专案） ────
        active_statuses = (1, 2, 3, 4, 5, 6, 10, 11)
        active_projects = (
            db.session.query(ProjectDataModel)
            .filter(
                ProjectDataModel.project_status.in_(active_statuses),
                ProjectDataModel.status == 1,
            )
            .order_by(ProjectDataModel.priority.desc())
            .all()
        )
        # ── 拉取本周/上周完结的专案（project_status=7） ────────────────────
        recent_completed_projects = (
            db.session.query(ProjectDataModel)
            .filter(
                ProjectDataModel.project_status == 7,
                ProjectDataModel.status == 1,
                ProjectDataModel.end_time >= last_week_start.isoformat(),
                ProjectDataModel.end_time <= this_week_end.isoformat(),
            )
            .order_by(ProjectDataModel.priority.desc())
            .all()
        )
        completed_ids = {p.id for p in recent_completed_projects}
        projects = active_projects + recent_completed_projects

        # ── 批量查询用户姓名 ──────────────────────────────────────────────
        all_work_nos: set = set()
        for p in projects:
            if p.project_pm: all_work_nos.add(p.project_pm)
            if p.product_pm: all_work_nos.add(p.product_pm)
        funcs_all = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.project_id.in_([p.id for p in projects]),
                FunctionDataModel.function_status != 9,
                FunctionDataModel.status == 1,
            )
            .all()
        )
        for f in funcs_all:
            resp = json.loads(f.responsible) if f.responsible else []
            all_work_nos.update(resp)

        name_map: dict = _dao.name_map(all_work_nos)

        # ── 查询每个 function 的最新进度记录 ─────────────────────────────
        func_ids = [f.id for f in funcs_all]
        progress_records = (
            db.session.query(ProgressRecordDataModel)
            .filter(ProgressRecordDataModel.function_id.in_(func_ids))
            .order_by(ProgressRecordDataModel.created_at.desc())
            .all()
        ) if func_ids else []

        # 按 function_id 分组进度记录（已按时间倒序）
        prog_map: dict = {}
        for pr in progress_records:
            prog_map.setdefault(pr.function_id, []).append(pr)

        # ── 构建函数：计算 status 和 is_overdue ───────────────────────────
        # status 反映实际工作状态（not_started/in_progress/completed）
        # is_overdue 独立表示是否已超过截止日期，两者互不干扰
        def _compute_status(f: FunctionDataModel):
            s = f.function_status or 1
            if s == 4:
                return "completed"
            if s == 1:
                return "not_started"
            return "in_progress"

        def _compute_is_overdue(f: FunctionDataModel, status: str) -> bool:
            if status == "completed":
                return False
            end = f.latest_expected_end_date or f.expected_end_date  # 延期後用新日期判斷
            if not end:
                return False
            try:
                return datetime.strptime(end, "%Y-%m-%d").date() < today
            except ValueError:
                return False

        def _compute_week_tag(f: FunctionDataModel, status: str) -> list:
            tags = []
            if status == "completed":
                # 已完成：以實際完成日為準，無實際完成日才回退預計日
                date_str = (f.end_time or "")[:10] if f.end_time else (
                    f.latest_expected_end_date or f.expected_end_date or ""
                )
            else:
                # 未完成：以延期後的預計完成日為準
                date_str = f.latest_expected_end_date or f.expected_end_date or ""

            if date_str:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d").date()
                    if last_week_start <= dt <= last_week_end:
                        tags.append("last_week")
                    elif this_week_start <= dt <= this_week_end:
                        tags.append("this_week")
                    elif next_week_start <= dt <= next_week_end:
                        tags.append("next_week")
                except ValueError:
                    pass

            return tags

        # ── 批量查询需求名称 ──────────────────────────────────────────────
        from dbs.mysql_db.model_tables import RequirementModel
        req_map: dict = {}
        if projects:
            reqs_all = db.session.query(RequirementModel).filter(
                RequirementModel.project_id.in_([p.id for p in projects]),
                RequirementModel.req_status != 9,
            ).all()
            req_map = {r.id: r.req_nm for r in reqs_all}

        # ── 按项目 + group1 分组构建 WBS ──────────────────────────────────
        func_by_proj: dict = {}
        for f in funcs_all:
            func_by_proj.setdefault(f.project_id, []).append(f)

        result = []
        for p in projects:
            funcs = func_by_proj.get(p.id, [])
            if not funcs:
                continue

            # 按 group1 分组（空 group1 归入 "其他"）
            group_map: dict = {}
            for f in funcs:
                key = (f.group1 or "").strip() or "功能任務"
                group_map.setdefault(key, []).append(f)

            wbs_functions = []
            for group_name, gfuncs in group_map.items():
                tasks = []
                for f in gfuncs:
                    status = _compute_status(f)
                    is_overdue = _compute_is_overdue(f, status)
                    week_tag = _compute_week_tag(f, status)
                    records = prog_map.get(f.id, [])
                    latest = records[0] if records else None
                    resp = json.loads(f.responsible) if f.responsible else []
                    assignee_names = [name_map.get(w.lower(), w) for w in resp]

                    end_str = f.latest_expected_end_date or f.expected_end_date or ""  # 延期後用新日期
                    original_end_str = f.expected_end_date or ""
                    reschedule_count = f.reschedule_count or 0
                    reschedule_reason = ""
                    if f.reschedule_log:
                        try:
                            log_list = json.loads(f.reschedule_log)
                            if log_list:
                                reschedule_reason = log_list[-1].get("reason", "") or ""
                        except (ValueError, TypeError):
                            pass
                    actual_end = (f.end_time or "")[:10] if f.end_time else None
                    days_overdue = None
                    if is_overdue and end_str:
                        try:
                            days_overdue = (today - datetime.strptime(end_str, "%Y-%m-%d").date()).days
                        except ValueError:
                            pass

                    history = []
                    for pr in records[:10]:  # 最近10条
                        submitter_name = name_map.get((pr.submitter or "").lower(), pr.submitter)
                        raw_files = []
                        if pr.files_json:
                            try:
                                raw_files = json.loads(pr.files_json)
                            except Exception:
                                pass
                        base = f"/api/project/{pr.project_id}/function/{pr.function_id}/progress/{pr.progress_id}/files"
                        files = [{"name": f["name"], "url": f"{base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
                        coops = []
                        if pr.cooperator:
                            try:
                                coops = json.loads(pr.cooperator)
                            except Exception:
                                pass
                        history.append({
                            "date":       (pr.created_at or "")[:10],
                            "created_at": pr.created_at or "",
                            "content":    pr.progress_record or "",
                            "progress":   pr.progress or 0,
                            "author":     submitter_name,
                            "work_no":    pr.submitter or "",
                            "time_consum": pr.time_consum or 0,
                            "cooperator": coops,
                            "files":      files,
                        })

                    tasks.append({
                        "id":              f.id,
                        "name":            f.function_nm,
                        "assignee":        "、".join(assignee_names) if assignee_names else "未指派",
                        "progress":        f.progress or 0,
                        "status":          status,
                        "is_overdue":      is_overdue,
                        "is_suspended":    (f.function_status or 1) == 8,
                        "expected_end":    end_str,
                        "original_end":    original_end_str,
                        "reschedule_count": reschedule_count,
                        "reschedule_reason": reschedule_reason,
                        "actual_end":      actual_end,
                        "days_overdue":    days_overdue,
                        "latest_update":   latest.progress_record if latest else None,
                        "week_tag":        week_tag,
                        "project_id":      p.id,
                        "function_id":     f.id,
                        "progress_history": history,
                        "requirement_id":  f.requirement_id or None,
                        "requirement_nm":  req_map.get(f.requirement_id, "") if f.requirement_id else "",
                    })

                group_progress = (
                    round(sum(t["progress"] for t in tasks) / len(tasks))
                    if tasks else 0
                )
                wbs_functions.append({
                    "id":       f"{p.id}::{group_name}",
                    "name":     group_name,
                    "progress": group_progress,
                    "tasks":    tasks,
                })

            pm_name = name_map.get((p.project_pm or "").lower(), p.project_pm)
            product_pm_name = name_map.get((p.product_pm or "").lower(), p.product_pm) if p.product_pm else ""
            result.append({
                "id":           p.id,
                "name":         p.project_nm,
                "department":   p.department or "",
                "pm":           pm_name,
                "product_pm":   product_pm_name,
                "progress":     p.progress or 0,
                "priority":     p.priority or 2,
                "start_date":   p.expected_start_date or (p.created_at or "")[:10],
                "expected_end": p.expected_end_date or "",
                "functions":    wbs_functions,
                "is_completed": p.id in completed_ids,
                "end_time":     p.end_time or "",
            })

        return result

    @cache_result(ttl=300, key_prefix="report_stats", key_builder=method_key_builder)
    def get_report_stats(self) -> list:
        """
        項目進度報表統計
        返回所有活躍專案及其任務狀態統計（包含阶段任务的早期专案，不含刪除）
        """
        from datetime import date as date_type

        today = date_type.today().isoformat()

        # 排除刪除(9) 的專案，包含所有阶段
        projects = (
            db.session.query(ProjectDataModel)
            .filter(
                ProjectDataModel.project_status != 9,
                ProjectDataModel.status == 1,
            )
            .order_by(ProjectDataModel.priority.desc(), ProjectDataModel.created_at.desc())
            .all()
        )

        project_ids = [p.id for p in projects]

        # 批量查詢所有有效功能任務（不含刪除）
        functions = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.project_id.in_(project_ids),
                FunctionDataModel.function_status != 9,
                FunctionDataModel.status == 1,
            )
            .all()
        ) if project_ids else []

        # 按專案聚合任務統計
        from collections import defaultdict
        stats_map: dict = defaultdict(lambda: {
            "total": 0, "draft": 0, "not_started": 0, "in_progress": 0,
            "completed": 0, "shelved": 0, "overdue_incomplete": 0, "overdue_complete": 0,
        })
        for f in functions:
            s = stats_map[f.project_id]
            s["total"] += 1
            end = f.latest_expected_end_date or f.expected_end_date
            is_past_due = bool(end and end < today)
            if f.function_status == 4:
                s["completed"] += 1
                orig_end = f.expected_end_date
                if orig_end and orig_end < today:
                    s["overdue_complete"] += 1
            elif f.function_status in (2, 3):
                s["in_progress"] += 1
                if is_past_due:
                    s["overdue_incomplete"] += 1
            elif f.function_status == 0:
                s["draft"] += 1
                if is_past_due:
                    s["overdue_incomplete"] += 1
            elif f.function_status == 8:
                s["shelved"] += 1
            else:  # 1 = 未開始
                s["not_started"] += 1
                if is_past_due:
                    s["overdue_incomplete"] += 1

        result = []
        for p in projects:
            st = stats_map[p.id]
            total = st["total"]
            completed = st["completed"]
            pending = st["draft"] + st["not_started"] + st["in_progress"]
            overdue_total = st["overdue_incomplete"] + st["overdue_complete"]
            completion_rate = round(completed / total * 100, 1) if total > 0 else 0.0
            overdue_rate = round(overdue_total / total * 100, 1) if total > 0 else 0.0
            result.append({
                "project_id":        p.id,
                "project_nm":        p.project_nm,
                "status":            p.project_status,
                "total":             total,
                "pending":           pending,
                "draft":             st["draft"],
                "not_started":       st["not_started"],
                "in_progress":       st["in_progress"],
                "completed":         completed,
                "shelved":           st["shelved"],
                "overdue_incomplete": st["overdue_incomplete"],
                "overdue_complete":  st["overdue_complete"],
                "completion_rate":   completion_rate,
                "overdue_rate":      overdue_rate,
                "expected_end_date": p.expected_end_date or "",
            })
        return result

    def get_member_report_stats(self) -> list:
        """
        成員報表統計
        返回每位負責人的任務狀態統計（含專案任務、系統任務、AR任務）
        """
        import json
        from datetime import date as date_type
        from collections import defaultdict
        from dbs.mysql_db.model_tables import UserProfileModel, TemporaryDutyModel

        today = date_type.today().isoformat()

        # ── 專案任務 (FunctionDataModel) ─────────────────────────────────────
        active_project_ids = [
            p.id for p in db.session.query(ProjectDataModel.id)
            .filter(
                ProjectDataModel.project_status != 9,
                ProjectDataModel.status == 1,
            ).all()
        ]

        functions = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.project_id.in_(active_project_ids),
                FunctionDataModel.function_status != 9,
                FunctionDataModel.status == 1,
            )
            .all()
        ) if active_project_ids else []

        # ── 系統任務 + AR任務 (TemporaryDutyModel) ───────────────────────────
        duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.duty_status != 9,
            TemporaryDutyModel.status == 1,
        ).all()

        stats_map: dict = defaultdict(lambda: {
            "total": 0, "draft": 0, "not_started": 0, "in_progress": 0, "completed": 0,
            "shelved": 0, "overdue_incomplete": 0, "overdue_complete": 0,
        })

        all_work_nos: set = set()

        def _parse_responsible(raw) -> list:
            if not raw:
                return []
            try:
                return json.loads(raw)
            except (ValueError, TypeError):
                return []

        # 統計專案任務
        for f in functions:
            responsible = _parse_responsible(f.responsible)
            if not responsible:
                continue
            end = f.latest_expected_end_date or f.expected_end_date
            is_past_due = bool(end and end < today)
            orig_end = f.expected_end_date
            for wn in responsible:
                all_work_nos.add(wn)
                s = stats_map[wn]
                s["total"] += 1
                if f.function_status == 0:
                    s["draft"] += 1
                elif f.function_status == 4:
                    s["completed"] += 1
                    if orig_end and orig_end < today:
                        s["overdue_complete"] += 1
                elif f.function_status in (2, 3):
                    s["in_progress"] += 1
                    if is_past_due:
                        s["overdue_incomplete"] += 1
                elif f.function_status == 8:
                    s["shelved"] += 1
                else:
                    s["not_started"] += 1
                    if is_past_due:
                        s["overdue_incomplete"] += 1

        # 統計系統任務 + AR任務
        for d in duties:
            responsible = _parse_responsible(d.responsible)
            if not responsible:
                continue
            end = d.latest_expected_end_date or d.expected_end_date
            is_past_due = bool(end and end < today)
            orig_end = d.expected_end_date
            for wn in responsible:
                all_work_nos.add(wn)
                s = stats_map[wn]
                s["total"] += 1
                if d.duty_status == 0:
                    s["draft"] += 1
                elif d.duty_status == 3:
                    s["completed"] += 1
                    if orig_end and orig_end < today:
                        s["overdue_complete"] += 1
                elif d.duty_status in (1, 2):
                    s["in_progress"] += 1
                    if is_past_due:
                        s["overdue_incomplete"] += 1
                elif d.duty_status == 8:
                    s["shelved"] += 1
                else:
                    s["not_started"] += 1
                    if is_past_due:
                        s["overdue_incomplete"] += 1

        # 查詢姓名
        name_map: dict = _dao.name_map(all_work_nos)

        result = []
        for wn, st in stats_map.items():
            total = st["total"]
            completed = st["completed"]
            pending = st["not_started"] + st["in_progress"]
            overdue_total = st["overdue_incomplete"] + st["overdue_complete"]
            result.append({
                "work_no":           wn,
                "name":              name_map.get(wn.lower(), wn),
                "total":             total,
                "draft":             st["draft"],
                "pending":           pending,
                "not_started":       st["not_started"],
                "in_progress":       st["in_progress"],
                "completed":         completed,
                "shelved":           st["shelved"],
                "overdue_incomplete": st["overdue_incomplete"],
                "overdue_complete":  st["overdue_complete"],
                "completion_rate":   round(completed / total * 100, 1) if total > 0 else 0.0,
                "overdue_rate":      round(overdue_total / total * 100, 1) if total > 0 else 0.0,
            })
        result.sort(key=lambda x: x["total"], reverse=True)
        return result


class FunctionController:

    def get_function(self, function_id: str):
        f = _dao.find_active_function(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        return f.to_dict()

    def add_function(self, project_id: str, payload: dict, creator: str):
        from utils.exceptions import PermissionException
        project = _dao.find_active_project(project_id)
        if not project:
            raise ResourceNotFoundException(resource_type="项目")
        requirement_id = payload.get("requirement_id", "")
        if requirement_id:
            # 关联需求时，需求必须已通过审核
            from dbs.mysql_db.model_tables import RequirementModel
            req = db.session.query(RequirementModel).filter_by(id=requirement_id).first()
            if not req or req.req_status != 2:
                raise PermissionException(msg="需求尚未通过审核，无法在该需求下新增任务")
        if project.project_status not in (3, 10, 5):
            raise PermissionException(msg="只有規劃中、排程安排或執行中階段可以新增功能任務")
        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                parsed = json.loads(resp)
                resp = parsed if isinstance(parsed, list) else [resp]
            except (json.JSONDecodeError, ValueError):
                resp = [resp] if resp else []
        resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
        # 執行中階段新增的任務需先通過審核，初始為草稿狀態
        initial_status = 0 if project.project_status == 5 else 1
        f = FunctionDataModel(
            function_nm=payload["function_nm"],
            describe=payload.get("describe", ""),
            project_id=project_id,
            responsible=json.dumps(resp, ensure_ascii=False),
            priority=payload.get("priority", 2),
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
            group1=payload.get("group1", ""),
            group2=payload.get("group2", ""),
            requirement_id=requirement_id or None,
            function_status=initial_status,
        )
        db.session.add(f)
        db.session.commit()
        # 通知负责人（排除创建者本人；草稿任務等審核通過再通知）
        if initial_status != 0:
            from controllers.notification_controller import push_notification
            from dbs.mysql_db.model_tables import UserProfileModel as _UPM2
            _creator_u = db.session.query(_UPM2).filter_by(work_no=creator).first()
            _creator_nm = _creator_u.name if _creator_u else creator
            _p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
            _p_nm = _p.project_nm if _p else ""
            notif_targets = [w for w in resp if w != creator]
            if notif_targets:
                push_notification(
                    recipients=notif_targets,
                    title="您已被指派為功能任務負責人",
                    desc=f"【{_p_nm}】任務「{f.function_nm}」已指派您為負責人，建立人：{_creator_nm}" if _p_nm else f"任務「{f.function_nm}」已指派您為負責人，建立人：{_creator_nm}",
                    link_type="project",
                    link_id=project_id,
                )
        return {"function_id": f.id, "is_draft": initial_status == 0}

    def submit_task_review(self, project_id: str, function_ids: list, reviewer: list, operator: str):
        """批量提交草稿任務審核（執行階段新增任務）"""
        from utils.exceptions import PermissionException
        project = _dao.find_project_by_id(project_id)
        if not project or project.project_status != 5:
            raise PermissionException(msg="只有執行中的專案才能提交任務審核")
        operator = (operator or "").strip().lower()
        project_pm = (project.project_pm or "").strip().lower()
        if operator != project_pm:
            raise PermissionException(msg="只有專案PM可以提交任務審核")
        reviewer = [(w or "").strip().lower() for w in reviewer if w]
        if not reviewer:
            raise PermissionException(msg="請指定審核人")
        if not function_ids:
            raise PermissionException(msg="請選擇要提交的任務")

        # 驗證所有任務都是草稿狀態且屬於本專案
        funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.id.in_(function_ids),
            FunctionDataModel.project_id == project_id,
        ).all()
        if len(funcs) != len(function_ids):
            raise PermissionException(msg="部分任務不存在或不屬於本專案")
        for f in funcs:
            if f.function_status != 0:
                raise PermissionException(msg=f"任務「{f.function_nm}」不是草稿狀態，無法提交審核")

        now = CommonTools.get_now()
        # 建立審核節點
        nodes = [{"node_id": uuid.uuid4().hex, "order": i + 1, "approver_work_no": w,
                  "approver": w, "status": 0} for i, w in enumerate(reviewer)]

        apply = ReviewApplyModel(
            project_id=project_id,
            apply_type="新增任務審核",
            apply_type_code="task_addition_review",
            submitter=operator,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            priority=project.priority or 2,
            apply_status=1,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
            function_ids_json=json.dumps(function_ids, ensure_ascii=False),
        )
        db.session.add(apply)

        # 任務保留 status=0（草稿），等審核通過後改為 1（待開始）
        db.session.commit()

        # 通知第一位審核人
        from controllers.notification_controller import push_notification
        func_names = "、".join(f.function_nm for f in funcs[:3])
        if len(funcs) > 3:
            func_names += f" 等{len(funcs)}項"
        push_notification(
            recipients=[reviewer[0]],
            title="您有新的任務審核待處理",
            desc=f"專案「{project.project_nm}」的任務「{func_names}」需要您審核。",
            link_type="review",
            link_id=apply.id,
        )
        return {"apply_id": apply.id}

    def update_function(self, function_id: str, payload: dict):
        f = _dao.find_active_function(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        _assert_project_not_in_review(f.project_id)
        for field in ("function_nm", "describe", "expected_start_date",
                      "expected_end_date", "priority", "group1", "group2", "requirement_id"):
            if field in payload and payload[field] is not None:
                setattr(f, field, payload[field])
        new_resp = []
        removed_resp = []
        old_resp_snap = []
        full_resp = []
        resp_changed = False
        if "responsible" in payload and payload["responsible"] is not None:
            resp = payload["responsible"]
            if isinstance(resp, str):
                try:
                    parsed = json.loads(resp)
                    resp = parsed if isinstance(parsed, list) else [resp]
                except (json.JSONDecodeError, ValueError):
                    resp = [resp] if resp else []
            resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
            old_resp_snap = json.loads(f.responsible) if f.responsible else []
            new_resp = [w for w in resp if w not in old_resp_snap]
            removed_resp = [w for w in old_resp_snap if w not in resp]
            full_resp = resp
            resp_changed = True
            f.responsible = json.dumps(resp, ensure_ascii=False)
        f.update_at = CommonTools.get_now()
        db.session.commit()
        # 同步需求进度和预计完成时间
        if f.requirement_id:
            from controllers.requirement_controller import RequirementController
            RequirementController._sync_project_req_progress(f.requirement_id)
            db.session.commit()
        if resp_changed and (new_resp or removed_resp):
            from controllers.notification_controller import push_notification
            project = db.session.query(ProjectDataModel).filter_by(id=f.project_id).first()
            project_nm = project.project_nm if project else ""
            project_pm = (project.project_pm or "").strip().lower() if project else ""
            # 通知新增负责人
            if new_resp:
                push_notification(
                    recipients=new_resp,
                    title="您已被指派為功能任務負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」已指派您為負責人，請及時跟進。",
                    link_type="project",
                    link_id=f.project_id,
                )
            # 通知已有负责人（有新成员加入时）
            existing_resp = [w for w in full_resp if w in old_resp_snap]
            if new_resp and existing_resp:
                push_notification(
                    recipients=existing_resp,
                    title="您負責的任務新增了負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」加入了新的負責人，請注意協作。",
                    link_type="project",
                    link_id=f.project_id,
                )
            # 通知被移除的负责人
            if removed_resp:
                push_notification(
                    recipients=removed_resp,
                    title="您已被移除功能任務負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」已將您從負責人名單中移除。",
                    link_type="project",
                    link_id=f.project_id,
                )
            # 通知专案PM（若PM不在变动名单中）
            changed_wns = set(new_resp + removed_resp)
            if project_pm and project_pm not in changed_wns:
                push_notification(
                    recipients=[project_pm],
                    title="功能任務負責人已調整",
                    desc=f"【{project_nm}】任務「{f.function_nm}」的負責人已更新。",
                    link_type="project",
                    link_id=f.project_id,
                )

    def reschedule_function(self, function_id: str, new_end_date: str, reason: str, operator: str):
        """
        延期任务：仅专案PM可操作，更新最新预计完成时间，记录延期历史。
        """
        from utils.exceptions import PermissionException
        f = _dao.find_active_function(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")

        # 仅专案PM可延期
        project = _dao.find_project_by_id(f.project_id)
        if not project or operator.lower() != (project.project_pm or "").lower():
            raise PermissionException(msg="僅專案PM可進行任務延期操作")

        # 当前生效的截止日期
        current_end = f.latest_expected_end_date or f.expected_end_date or ""

        # 更新延期记录
        history = []
        if f.reschedule_log:
            try:
                history = json.loads(f.reschedule_log)
            except (ValueError, TypeError):
                pass

        history.append({
            "from": current_end,
            "to": new_end_date,
            "reason": reason,
            "date": CommonTools.get_now()[:10],
            "operator": operator,
        })

        f.latest_expected_end_date = new_end_date
        f.reschedule_count = (f.reschedule_count or 0) + 1
        f.reschedule_log = json.dumps(history, ensure_ascii=False)
        f.update_at = CommonTools.get_now()
        db.session.commit()
        # 同步需求预计完成时间
        if f.requirement_id:
            from controllers.requirement_controller import RequirementController
            RequirementController._sync_project_req_progress(f.requirement_id)
            db.session.commit()
        # 通知所有责任人任务已延期
        resp = json.loads(f.responsible) if f.responsible else []
        if resp:
            from controllers.notification_controller import push_notification
            push_notification(
                recipients=resp,
                title="您負責的任務已延期",
                desc=f"【{project.project_nm}】任務「{f.function_nm}」已延期至 {new_end_date}，原因：{reason}",
                link_type="project",
                link_id=f.project_id,
            )
        return f.to_dict()

    def delete_function(self, function_id: str):
        f = _dao.find_function_by_id(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        f.function_status = 9
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def set_status(self, function_id: str, status: int):
        f = _dao.find_function_by_id(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        f.function_status = status
        f.update_at = CommonTools.get_now()
        db.session.commit()

    def submit_function_completion(self, project_id: str, function_id: str, submitter: str):
        """提交任务完结：
        - 若提交人是专案 PM → 直接设为已完结（status=4）
        - 否则 → 创建审核记录发给专案 PM，设为完结审核（status=3）
        """
        _assert_project_not_in_review(project_id)
        f = _dao.find_function_by_id(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        if f.function_status == 4:
            raise BusinessException(msg="任务已完结，无法重复提交")
        if f.function_status == 3:
            raise BusinessException(msg="任务已提交完结审核，等待审核中")

        project = _dao.find_project_by_id(project_id)
        if not project:
            raise ResourceNotFoundException(resource_type="项目")

        project_pm = (project.project_pm or "").strip().lower()
        now = CommonTools.get_now()

        if submitter.strip().lower() == project_pm:
            # 专案 PM 直接完结
            resp_snap = json.loads(f.responsible) if f.responsible else []
            f.function_status = 4
            f.end_time = now[:10]
            f.update_at = now
            # Recalculate project overall progress
            active_funcs = db.session.query(FunctionDataModel).filter_by(project_id=project_id).filter(
                FunctionDataModel.function_status != 9
            ).all()
            if active_funcs:
                project.progress = sum(fn.progress or 0 for fn in active_funcs) // len(active_funcs)
                project.update_at = now
            # Sync requirement progress if this function belongs to a requirement
            if f.requirement_id:
                from controllers.requirement_controller import RequirementController
                RequirementController._sync_project_req_progress(f.requirement_id)
            db.session.commit()
            # 通知所有责任人任务已完结
            notif_targets = [w for w in resp_snap if w != project_pm]
            if notif_targets:
                from controllers.notification_controller import push_notification
                push_notification(
                    recipients=notif_targets,
                    title="您負責的任務已完結",
                    desc=f"【{project.project_nm}】任務「{f.function_nm}」已由專案PM標記為完結。",
                    link_type="project",
                    link_id=project_id,
                )
            return {"direct_complete": True}
        else:
            # 创建审核记录，等待 PM 审批
            from dbs.mysql_db.model_tables import generate_uuid
            review = ReviewApplyModel(
                id=generate_uuid(),
                project_id=project_id,
                function_id=function_id,
                apply_type="功能完結審核",
                apply_type_code="function_complete",
                submitter=submitter.strip().lower(),
                reviewer=json.dumps([project_pm], ensure_ascii=False),
                apply_status=1,
                approval_nodes_json=json.dumps([{
                    "node_id": generate_uuid(),
                    "order": 1,
                    "approver": project_pm,
                    "approver_work_no": project_pm,
                    "status": 0,
                    "is_countersign": False,
                    "approved_at": None,
                    "comment": None,
                }], ensure_ascii=False),
            )
            f.function_status = 3
            f.update_at = now
            db.session.add(review)
            db.session.commit()
            # 通知专案 PM 有功能任务待审核
            from controllers.notification_controller import push_notification
            push_notification(
                recipients=[project_pm],
                title="您有新的功能完結審核待處理",
                desc=f"【{project.project_nm}】任務「{f.function_nm}」已提交完結審核，請前往審核。",
                link_type="review",
                link_id=review.id,
            )
            return {"direct_complete": False}

    def allocate(self, function_id: str, payload: dict):
        f = _dao.find_function_by_id(function_id)
        if not f:
            raise ResourceNotFoundException(resource_type="功能任务")
        old_resp = json.loads(f.responsible) if f.responsible else []
        resp = payload.get("responsible", [])
        resp = [w.strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
        new_resp = [w for w in resp if w not in old_resp]
        removed_resp = [w for w in old_resp if w not in resp]
        f.responsible = json.dumps(resp, ensure_ascii=False)
        if payload.get("expected_start_date"):
            f.expected_start_date = payload["expected_start_date"]
        if payload.get("expected_end_date"):
            f.expected_end_date = payload["expected_end_date"]
        f.update_at = CommonTools.get_now()
        db.session.commit()
        if new_resp or removed_resp:
            from controllers.notification_controller import push_notification
            project = db.session.query(ProjectDataModel).filter_by(id=f.project_id).first()
            project_nm = project.project_nm if project else ""
            # 通知新增负责人
            if new_resp:
                push_notification(
                    recipients=new_resp,
                    title="您已被指派為功能任務負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」已指派您為負責人，請及時跟進。",
                    link_type="project",
                    link_id=f.project_id,
                )
            # 通知已有负责人（有新成员加入时）
            existing_resp = [w for w in resp if w in old_resp]
            if new_resp and existing_resp:
                push_notification(
                    recipients=existing_resp,
                    title="您負責的任務新增了負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」加入了新的負責人，請注意協作。",
                    link_type="project",
                    link_id=f.project_id,
                )
            # 通知被移除的负责人
            if removed_resp:
                push_notification(
                    recipients=removed_resp,
                    title="您已被移除功能任務負責人",
                    desc=f"【{project_nm}】任務「{f.function_nm}」已將您從負責人名單中移除。",
                    link_type="project",
                    link_id=f.project_id,
                )

    def my_functions(self, work_no: str, page: int = 1, size: int = 20, status: int = None, scope: str = 'all') -> dict:
        """查询功能任务。scope='mine' 仅负责任务；scope='all' 所属专案全部；scope='supervisor' 下属专案全部"""
        wn_lower = work_no.lower()
        if scope == 'mine':
            q = db.session.query(FunctionDataModel).filter(
                FunctionDataModel.function_status != 9,
                db.func.lower(FunctionDataModel.responsible).like(f'%"{wn_lower}"%'),
            )
        elif scope == 'supervisor':
            # 找出所有下属工号
            subordinates = [r[0] for r in db.session.query(HierarchyModel.subordinate_work_no).filter(
                db.func.lower(HierarchyModel.supervisor_work_no) == wn_lower,
            ).all()]
            all_nos = [work_no] + subordinates
            all_nos_lower = [n.lower() for n in all_nos]
            # 下属担任 PM 的专案
            pm_ids = [r[0] for r in db.session.query(ProjectDataModel.id).filter(
                db.func.lower(ProjectDataModel.project_pm).in_(all_nos_lower),
                ProjectDataModel.project_status != 9,
            ).all()]
            # 下属作为负责人出现的专案
            from sqlalchemy import or_
            resp_filters = [db.func.lower(FunctionDataModel.responsible).like(f'%"{n}"%') for n in all_nos_lower]
            resp_proj_ids = [r[0] for r in db.session.query(FunctionDataModel.project_id).filter(
                FunctionDataModel.function_status != 9,
                or_(*resp_filters) if resp_filters else db.false(),
            ).distinct().all()]
            all_proj_ids = list(set(pm_ids + resp_proj_ids))
            q = db.session.query(FunctionDataModel).filter(
                FunctionDataModel.function_status != 9,
                FunctionDataModel.project_id.in_(all_proj_ids) if all_proj_ids else db.false(),
            )
        else:
            # scope='all'：收集用户所属专案 ID（作为 PM 或在任意任务中为负责人）
            pm_ids = [r[0] for r in db.session.query(ProjectDataModel.id).filter(
                db.func.lower(ProjectDataModel.project_pm) == wn_lower,
                ProjectDataModel.project_status != 9,
            ).all()]
            func_proj_ids = [r[0] for r in db.session.query(FunctionDataModel.project_id).filter(
                db.func.lower(FunctionDataModel.responsible).like(f'%"{wn_lower}"%'),
                FunctionDataModel.function_status != 9,
            ).distinct().all()]
            all_proj_ids = list(set(pm_ids + func_proj_ids))
            q = db.session.query(FunctionDataModel).filter(
                FunctionDataModel.function_status != 9,
                FunctionDataModel.project_id.in_(all_proj_ids) if all_proj_ids else db.false(),
            )
        if status is not None:
            q = q.filter(FunctionDataModel.function_status == status)
        total = q.count()
        funcs = q.order_by(FunctionDataModel.expected_end_date.asc()).offset((page - 1) * size).limit(size).all()

        # 批量查专案信息
        proj_ids = list({f.project_id for f in funcs})
        projects = db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(proj_ids)).all()
        proj_map = {p.id: p for p in projects}

        # 批量查需求名称
        req_ids = list({f.requirement_id for f in funcs if f.requirement_id})
        req_map = {}
        if req_ids:
            reqs = db.session.query(RequirementModel.id, RequirementModel.req_nm).filter(
                RequirementModel.id.in_(req_ids)
            ).all()
            req_map = {r.id: r.req_nm for r in reqs}

        result = []
        for f in funcs:
            d = f.to_dict()
            p = proj_map.get(f.project_id)
            d['project_nm']     = p.project_nm if p else ''
            d['project_status'] = p.project_status if p else 0
            d['project_pm']     = p.project_pm if p else ''
            d['requirement_nm'] = req_map.get(f.requirement_id, '') if f.requirement_id else ''
            result.append(d)

        return {'total_count': total, 'data_list': result}

    def list_functions(self, project_id: str, payload: dict):
        page = payload.get("page", 1)
        size = payload.get("size", 20)
        keyword = payload.get("keyword", "")
        status = payload.get("status")
        requirement_id = payload.get("requirement_id")
        q = db.session.query(FunctionDataModel).filter_by(project_id=project_id).filter(
            FunctionDataModel.function_status != 9
        )
        if keyword:
            q = q.filter(FunctionDataModel.function_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(FunctionDataModel.function_status == status)
        if requirement_id:
            q = q.filter(FunctionDataModel.requirement_id == requirement_id)
        total = q.count()
        funcs = q.offset((page - 1) * size).limit(size).all()

        # Lazy backfill: derive start_time/end_time from progress records for tasks missing them
        needs_commit = False
        need_backfill = [f for f in funcs if not (f.start_time and f.end_time)]
        if need_backfill:
            from collections import defaultdict
            backfill_ids = [f.id for f in need_backfill]
            all_bf_recs = (
                db.session.query(ProgressRecordDataModel)
                .filter(ProgressRecordDataModel.function_id.in_(backfill_ids))
                .order_by(ProgressRecordDataModel.created_at.asc())
                .all()
            )
            recs_by_func: dict = defaultdict(list)
            for rec in all_bf_recs:
                recs_by_func[rec.function_id].append(rec)

            for f in need_backfill:
                records = recs_by_func[f.id]
                if not records:
                    continue
                if not f.start_time:
                    earliest = records[0].created_at
                    if earliest:
                        f.start_time = earliest[:10]
                        needs_commit = True
                if not f.end_time and f.function_status == 4:
                    # Use latest record's created_at as actual end
                    latest = records[-1].created_at
                    if latest:
                        f.end_time = latest[:10]
                        needs_commit = True
        if needs_commit:
            db.session.commit()

        # Batch-load requirement names for functions that have a requirement_id
        req_ids = list({f.requirement_id for f in funcs if f.requirement_id})
        req_nm_map = {}
        if req_ids:
            from dbs.mysql_db.model_tables import RequirementModel
            reqs = db.session.query(RequirementModel).filter(RequirementModel.id.in_(req_ids)).all()
            req_nm_map = {r.id: r.req_nm for r in reqs}

        result = []
        for f in funcs:
            d = f.to_dict()
            d["requirement_nm"] = req_nm_map.get(f.requirement_id, "") if f.requirement_id else ""
            result.append(d)

        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": result,
        }

    def _progress_upload_dir(self, project_id: str, progress_id: str) -> str:
        from configs.base import BaseConfig
        base = os.path.abspath(BaseConfig.UPLOAD_DIR)
        path = os.path.join(base, "progress_files", project_id, progress_id)
        os.makedirs(path, exist_ok=True)
        return path

    def create_progress(self, project_id: str, function_id: str, payload: dict, submitter: str, files=None):
        _assert_project_not_in_review(project_id)
        from utils.exceptions import PermissionException
        func_check = _dao.find_function_by_id(function_id)
        if func_check:
            try:
                responsible_list = json.loads(func_check.responsible or "[]")
            except Exception:
                responsible_list = []
            if responsible_list and (submitter or "").strip().lower() not in [r.lower() for r in responsible_list]:
                raise PermissionException(msg="只有任務負責人才能提交進度更新")
        from dbs.mysql_db.model_tables import generate_uuid
        devs = payload.get("cooperator", [])
        progress_id = generate_uuid()   # generate before record so we can use it for file paths
        rec = ProgressRecordDataModel(
            progress_id=progress_id,
            project_id=project_id,
            function_id=function_id,
            progress=payload["progress"],
            progress_record=payload.get("progress_record", ""),
            submitter=(submitter or "").strip().lower(),
            cooperator=json.dumps(devs, ensure_ascii=False),
            time_consum=payload.get("time_consum", 0),
            is_overtime=str(payload.get("is_overtime", "")).lower() in ("true", "1", "yes"),
            overtime_hours=float(payload.get("overtime_hours", 0) or 0),
        )
        # Save attachments
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
                fid = uuid.uuid4().hex
                dest_dir = self._progress_upload_dir(project_id, progress_id)
                dest = os.path.join(dest_dir, f"{fid}.{ext}" if ext else fid)
                f_obj.save(dest)
                saved.append({"id": fid, "name": f_obj.filename, "ext": ext, "size": os.path.getsize(dest)})
            if saved:
                rec.files_json = json.dumps(saved, ensure_ascii=False)
        db.session.add(rec)
        # Update task progress and auto-advance status
        func = db.session.query(FunctionDataModel).filter_by(id=function_id).first()
        if func:
            func.progress = payload["progress"]
            if func.function_status == 1:
                func.function_status = 2   # 待開始 → 進行中
                # Record actual start date on first progress submission
                if not func.start_time:
                    func.start_time = CommonTools.get_now()[:10]
            func.update_at = CommonTools.get_now()
        # Recalculate project overall progress (average of all active functions)
        active_funcs = db.session.query(FunctionDataModel).filter_by(project_id=project_id).filter(
            FunctionDataModel.function_status != 9
        ).all()
        if active_funcs:
            project = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
            if project:
                project.progress = sum(int(f.progress or 0) for f in active_funcs) // len(active_funcs)
                project.update_at = CommonTools.get_now()
        # Sync requirement progress if this function belongs to a requirement
        if func and func.requirement_id:
            from controllers.requirement_controller import RequirementController
            RequirementController._sync_project_req_progress(func.requirement_id)
        db.session.commit()
        return {"progress_id": rec.progress_id}

    def get_progress_file_path(self, project_id: str, progress_id: str, file_id: str):
        from utils.exceptions import ResourceNotFoundException
        rec = db.session.query(ProgressRecordDataModel).filter_by(progress_id=progress_id).first()
        if not rec or not rec.files_json:
            raise ResourceNotFoundException(resource_type="进度附件")
        try:
            file_list = json.loads(rec.files_json)
        except Exception:
            raise ResourceNotFoundException(resource_type="进度附件")
        meta = next((f for f in file_list if f["id"] == file_id), None)
        if not meta:
            raise ResourceNotFoundException(resource_type="进度附件")
        ext = meta.get("ext", "")
        filename = f"{file_id}.{ext}" if ext else file_id
        dest_dir = self._progress_upload_dir(project_id, progress_id)
        abs_path = os.path.join(dest_dir, filename)
        if not os.path.exists(abs_path):
            raise ResourceNotFoundException(resource_type="进度附件")
        return abs_path, meta["name"]

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
        from datetime import date as _date
        items = db.session.query(MilestoneModel).filter_by(project_id=project_id).filter(
            MilestoneModel.status == 1
        ).all()
        # Build function status map for this project
        funcs = db.session.query(FunctionDataModel).filter_by(project_id=project_id).filter(
            FunctionDataModel.function_status != 9
        ).all()
        func_status_map = {f.id: f.function_status for f in funcs}
        today = str(_date.today())

        result = []
        dirty = False
        for m in items:
            d = m.to_dict()
            # Recompute status dynamically from linked functions
            linked_ids = d.get("linked_functions") or []
            if linked_ids:
                statuses = [func_status_map.get(fid) for fid in linked_ids if fid in func_status_map]
                if statuses and all(s == 4 for s in statuses):
                    d["status"] = "achieved"
                    if not d.get("achieved_at"):
                        # 首次達成：持久化 achieved_at，避免每次查詢都返回今天
                        m.achieved_at = today
                        m.milestone_status = "achieved"
                        d["achieved_at"] = today
                        dirty = True
                elif m.target_date and m.target_date < today:
                    d["status"] = "overdue"
                else:
                    d["status"] = "pending"
            else:
                # No linked functions: rely on target_date
                if m.target_date and m.target_date < today and m.milestone_status != "achieved":
                    d["status"] = "overdue"
            result.append(d)
        if dirty:
            db.session.commit()
        return result

    def create_milestone(self, project_id: str, payload: dict, creator: str):
        _assert_project_not_in_review(project_id)
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
        m = _dao.find_milestone_by_id(milestone_id)
        if not m:
            raise ResourceNotFoundException(resource_type="里程碑")
        _assert_project_not_in_review(m.project_id)
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
        m = _dao.find_milestone_by_id(milestone_id)
        if not m:
            raise ResourceNotFoundException(resource_type="里程碑")
        _assert_project_not_in_review(m.project_id)
        m.status = 0
        m.update_at = CommonTools.get_now()
        db.session.commit()
