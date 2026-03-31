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
            operator in (p.creator or "", product_pm)
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
            product_pm=(payload.get("product_pm") or "").strip().lower(),
            project_pm=(payload.get("project_pm") or "").strip().lower(),
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
        WN_FIELDS = {"product_pm", "project_pm"}
        fields = ("project_nm", "describe", "department", "product_pm", "project_pm",
                  "expected_end_date", "priority", "group_id", "code_url", "expected_benefit")
        for f in fields:
            if f in payload and payload[f] is not None:
                v = (payload[f] or "").strip().lower() if f in WN_FIELDS else payload[f]
                setattr(p, f, v)
        p.update_at = CommonTools.get_now()
        db.session.commit()

    def set_project_pm(self, project_id: str, project_pm: str, operator: str):
        """规划中阶段由创建人/产品PM设定专案PM（仅在专案PM为空时允许）"""
        from utils.exceptions import PermissionException
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        if p.project_status != 3:
            raise PermissionException(msg="只有规划中阶段可以设定专案PM")
        if p.project_pm:
            raise PermissionException(msg="专案PM已设定，如需变更请编辑专案")
        if operator not in (p.creator or "", p.product_pm or ""):
            raise PermissionException(msg="只有创建人或产品PM可以设定专案PM")
        p.project_pm = (project_pm or "").strip().lower()
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
        from dbs.mysql_db.model_tables import UserProfileModel
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p:
            raise ResourceNotFoundException(resource_type="项目")
        # 提交立案审核：只有产品PM可以提交，且专案必须处于草稿阶段
        if status == 2:
            if p.project_status != 1:
                raise PermissionException(msg="只有草稿阶段的专案才能提交立案审核")
            if submitter != (p.product_pm or ""):
                raise PermissionException(msg="只有产品PM可以提交立案审核")
        # 提交规划审核：只有专案PM可以提交，且专案必须处于规划中阶段
        if status == 4:
            if p.project_status != 3:
                raise PermissionException(msg="只有规划中阶段的专案才能提交规划审核")
            if not (p.project_pm or ""):
                raise PermissionException(msg="请先设定专案PM再提交规划审核")
            if submitter != (p.project_pm or ""):
                raise PermissionException(msg="只有专案PM可以提交规划审核")
        # 提交排程审核：只有专案PM可以提交，且专案必须处于排程安排阶段
        if status == 11:
            if p.project_status != 10:
                raise PermissionException(msg="只有排程安排阶段的专案才能提交排程审核")
            if submitter != (p.project_pm or ""):
                raise PermissionException(msg="只有专案PM可以提交排程审核")
        type_map = {
            2:  ("立案申请", "initiate"),
            4:  ("规划审核", "plan"),
            11: ("排程审核", "schedule"),
            6:  ("完结审核", "project_complete"),
        }
        apply_type, apply_type_code = type_map.get(status, ("状态变更", "other"))

        # 获取提交人姓名
        submitter_profile = db.session.query(UserProfileModel).filter_by(work_no=submitter).first()
        submitter_name = submitter_profile.name if submitter_profile else submitter

        # 构建初始审批节点（按传入顺序排列）
        nodes = []
        for i, reviewer_wk in enumerate(reviewer):
            u = db.session.query(UserProfileModel).filter_by(work_no=reviewer_wk).first()
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

    def _enrich_review(self, r: 'ReviewApplyModel', viewer_work_no: str = "") -> dict:
        """为审批记录补充关联项目/功能/任务名称及提交人姓名，并标记当前用户是否轮到审核"""
        from dbs.mysql_db.model_tables import UserProfileModel
        project_nm = function_nm = duty_nm = None
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
        result = r.to_dict(project_nm=project_nm, function_nm=function_nm, duty_nm=duty_nm)
        # 补充提交人姓名（老记录 submitter_name 为空时从用户表查询）
        if not result.get("submitter_name"):
            u = db.session.query(UserProfileModel).filter_by(work_no=r.submitter).first()
            result["submitter_name"] = u.name if u else r.submitter
        # 老记录没有 approval_nodes 时，从 reviewer 列表构造基础节点
        if not result.get("approval_nodes"):
            reviewers = result.get("reviewer") or []
            if isinstance(reviewers, str):
                try:
                    import json as _json
                    reviewers = _json.loads(reviewers)
                except Exception:
                    reviewers = [reviewers]
            nodes = []
            for i, wk in enumerate(reviewers):
                u = db.session.query(UserProfileModel).filter_by(work_no=wk).first()
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
        # 标记当前查看者是否「轮到审核」：仅当该用户有 status=0 的节点时为 True
        if viewer_work_no and result["approval_nodes"]:
            nodes = result["approval_nodes"]
            sorted_nodes = sorted(nodes, key=lambda n: n.get("order", 0))
            # 找到第一个待审节点，判断是否是当前用户
            first_pending = next((n for n in sorted_nodes if n.get("status") == 0), None)
            result["is_my_turn"] = (
                first_pending is not None and
                first_pending.get("approver_work_no") == viewer_work_no
            )
        else:
            result["is_my_turn"] = False
        return result

    def get_review_list(self, page=1, size=20, work_no=None):
        from sqlalchemy import or_
        q = db.session.query(ReviewApplyModel).filter(
            ReviewApplyModel.duty_id.is_(None)
        )
        if work_no:
            # 包含原始审核人 OR 作为加签节点出现在 approval_nodes_json 中的人
            q = q.filter(or_(
                ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
            ))
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [self._enrich_review(r, viewer_work_no=work_no or "") for r in records],
        }

    def get_all_reviews(self, work_no=None):
        from sqlalchemy import or_
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.apply_status == 1)
        if work_no:
            q = q.filter(or_(
                ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
            ))
        enriched = [self._enrich_review(r, viewer_work_no=work_no or "") for r in q.all()]
        # 只返回轮到当前用户审核的记录
        return [e for e in enriched if e.get("is_my_turn")]

    def approve_review(self, review_id: str, status: int, reject_reason: str = "",
                       countersigns: list = None):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
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
            return

        r.apply_status = final_status
        r.update_at = now

        # requirement_change 审批仅更新申请记录，不影响项目状态
        if r.apply_type_code == 'requirement_change':
            db.session.commit()
            return

        # 同步更新功能任务状态（function_complete）
        # 项目状态码: 1=草稿 2=立案審核 3=規劃中 4=規劃審核 5=執行中 6=完結審核 7=完結
        # 功能状态码: 1=待開始 2=進行中 3=完結審核 4=已完結
        if r.function_id:
            func = db.session.query(FunctionDataModel).filter_by(id=r.function_id).first()
            if func:
                if final_status == 2:        # 通過 → 已完結
                    func.function_status = 4
                elif final_status in (3, 4):  # 拒絕/退回 → 退回進行中
                    func.function_status = 2
                func.update_at = now
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
                elif final_status in (3, 4) and next_fail:
                    p.project_status = next_fail
                p.update_at = now
        db.session.commit()

    def countersign_review(self, review_id: str, approver_work_no: str, approver_name: str):
        r = db.session.query(ReviewApplyModel).filter_by(id=review_id).first()
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
        from utils.exceptions import PermissionException
        project = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not project or project.project_status == 9:
            raise ResourceNotFoundException(resource_type="项目")
        if project.project_status not in (3, 10):
            raise PermissionException(msg="只有規劃中或排程安排階段可以新增功能任務")
        devs = payload.get("developers", [])
        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except (json.JSONDecodeError, ValueError):
                resp = [resp] if resp else []
        resp = [w.strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
        f = FunctionDataModel(
            function_nm=payload["function_nm"],
            describe=payload.get("describe", ""),
            project_id=project_id,
            responsible=json.dumps(resp, ensure_ascii=False),
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
        for field in ("function_nm", "describe", "expected_start_date",
                      "expected_end_date", "priority", "group1", "group2"):
            if field in payload and payload[field] is not None:
                setattr(f, field, payload[field])
        if "responsible" in payload and payload["responsible"] is not None:
            resp = payload["responsible"]
            if isinstance(resp, str):
                try:
                    resp = json.loads(resp)
                except (json.JSONDecodeError, ValueError):
                    resp = [resp] if resp else []
            resp = [w.strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
            f.responsible = json.dumps(resp, ensure_ascii=False)
        if "developers" in payload and payload["developers"] is not None:
            devs = payload["developers"]
            if isinstance(devs, str):
                try:
                    devs = json.loads(devs)
                except (json.JSONDecodeError, ValueError):
                    devs = [devs] if devs else []
            f.developers = json.dumps(devs if isinstance(devs, list) else [devs], ensure_ascii=False)
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
