# -*- coding: utf-8 -*-
"""用户控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import (
    ResourceNotFoundException, ResourceExistsException, BusinessException
)
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    UserProfileModel, RoleModel, UserRoleModel, HierarchyModel
)


class UserController:

    # ── 用户 CRUD ──────────────────────────────────────────────────────────────

    def list_users(self, page=1, size=20, keyword="", department=""):
        query = db.session.query(UserProfileModel).filter(UserProfileModel.status == 1)
        if keyword:
            query = query.filter(
                db.or_(
                    UserProfileModel.work_no.like(f"%{keyword}%"),
                    UserProfileModel.name.like(f"%{keyword}%"),
                )
            )
        if department:
            query = query.filter(UserProfileModel.department == department)
        total = query.count()
        users = query.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [u.to_dict() for u in users],
        }

    def get_user(self, work_no: str):
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        return user.to_dict()

    def create_user(self, payload: dict):
        work_no = payload["work_no"]
        if db.session.query(UserProfileModel).filter_by(work_no=work_no).first():
            raise ResourceExistsException(resource_type="工号")
        user = UserProfileModel(
            work_no=work_no,
            name=payload["name"],
            department=payload.get("department", ""),
            position=payload.get("position", ""),
            email=payload.get("email", ""),
            phone=payload.get("phone", ""),
            password=payload.get("password", ""),
            location=payload.get("location", ""),
        )
        db.session.add(user)
        db.session.commit()
        return {"work_no": work_no}

    def update_user(self, work_no: str, payload: dict):
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        for field in ("name", "department", "position", "email", "phone", "password", "location"):
            if field in payload and payload[field] is not None:
                setattr(user, field, payload[field])
        user.update_at = CommonTools.get_now()
        db.session.commit()

    def delete_user(self, work_no: str):
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        user.status = 0
        user.status_update_at = CommonTools.get_now()
        db.session.commit()

    def get_departments(self):
        rows = (
            db.session.query(UserProfileModel.department)
            .filter(UserProfileModel.status == 1, UserProfileModel.department.isnot(None))
            .distinct()
            .all()
        )
        return sorted({r[0] for r in rows if r[0]})

    # ── 上下级关系 ─────────────────────────────────────────────────────────────

    def set_relation(self, supervisor_work_no: str, subordinate_work_no: str):
        rel = HierarchyModel(
            supervisor_work_no=supervisor_work_no,
            subordinate_work_no=subordinate_work_no,
        )
        db.session.add(rel)
        db.session.commit()
        return rel.to_dict()

    def get_all_relations(self):
        """获取所有上下级关系（批量，供前端层级页面初始化）"""
        rels = db.session.query(HierarchyModel).all()
        work_nos = set()
        for r in rels:
            work_nos.add(r.supervisor_work_no)
            work_nos.add(r.subordinate_work_no)
        if work_nos:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.work_no.in_(work_nos),
                UserProfileModel.status == 1,
            ).all()
            name_map = {u.work_no: u.name for u in users}
        else:
            name_map = {}
        return [
            {
                "id": r.id,
                "supervisor_work_no": r.supervisor_work_no,
                "supervisor_name": name_map.get(r.supervisor_work_no, r.supervisor_work_no),
                "subordinate_work_no": r.subordinate_work_no,
                "subordinate_name": name_map.get(r.subordinate_work_no, r.subordinate_work_no),
            }
            for r in rels
        ]

    def remove_relation(self, relation_id: str):
        rel = db.session.query(HierarchyModel).filter_by(id=relation_id).first()
        if not rel:
            raise ResourceNotFoundException(resource_type="关系记录")
        db.session.delete(rel)
        db.session.commit()

    def get_subordinates(self, work_no: str, all_levels: bool = False):
        """获取直接下级（all_levels=True 时递归获取所有层级）"""
        result = []
        queue = [work_no]
        visited = set()
        while queue:
            cur = queue.pop(0)
            if cur in visited:
                continue
            visited.add(cur)
            rels = db.session.query(HierarchyModel).filter_by(supervisor_work_no=cur).all()
            for r in rels:
                sub_wn = r.subordinate_work_no
                user = db.session.query(UserProfileModel).filter_by(work_no=sub_wn, status=1).first()
                info = user.to_dict() if user else {"work_no": sub_wn, "name": sub_wn}
                result.append(info)
                if all_levels:
                    queue.append(sub_wn)
        return result

    def get_supervisors(self, work_no: str):
        rels = db.session.query(HierarchyModel).filter_by(subordinate_work_no=work_no).all()
        result = []
        for r in rels:
            user = db.session.query(UserProfileModel).filter_by(work_no=r.supervisor_work_no, status=1).first()
            info = user.to_dict() if user else {"work_no": r.supervisor_work_no, "name": r.supervisor_work_no}
            result.append(info)
        return result

    def get_team_tree(self, work_no: str):
        """返回该用户为根的树形结构"""
        def build_node(wn, depth=0):
            if depth > 5:
                return None
            user = db.session.query(UserProfileModel).filter_by(work_no=wn, status=1).first()
            node = user.to_dict() if user else {"work_no": wn, "name": wn}
            rels = db.session.query(HierarchyModel).filter_by(supervisor_work_no=wn).all()
            node["children"] = [
                build_node(r.subordinate_work_no, depth + 1)
                for r in rels
                if build_node(r.subordinate_work_no, depth + 1) is not None
            ]
            return node
        return build_node(work_no)

    # ── 角色管理 ───────────────────────────────────────────────────────────────

    def assign_role(self, work_no: str, role_code: str):
        existing = db.session.query(UserRoleModel).filter_by(work_no=work_no).first()
        if existing:
            existing.role_code = role_code
        else:
            db.session.add(UserRoleModel(work_no=work_no, role_code=role_code))
        db.session.commit()

    def remove_role(self, work_no: str):
        db.session.query(UserRoleModel).filter_by(work_no=work_no).delete()
        db.session.commit()

    def get_user_role(self, work_no: str):
        row = (
            db.session.query(UserRoleModel, RoleModel)
            .join(RoleModel, UserRoleModel.role_code == RoleModel.code)
            .filter(UserRoleModel.work_no == work_no)
            .first()
        )
        if not row:
            return None
        ur, role = row
        return {"role_code": role.code, "role_name": role.name}

    # ── 登录 & 首页统计 ────────────────────────────────────────────────────────

    def login(self, work_no: str, password: str, location: str = "") -> dict:
        """登录验证：优先检查管理员表，再检查普通用户表"""
        from utils.auth import create_token
        from controllers.system_admin_controller import SystemAdminController
        from dbs.mysql_db.model_tables import AdminUserModel

        # 1. 优先检查管理员表
        admin = db.session.query(AdminUserModel).filter_by(username=work_no, status=1).first()
        if admin:
            if admin.password != password:
                raise BusinessException(msg="密码错误", code="F20003")
            admin.last_login = CommonTools.get_now()
            db.session.commit()
            identity = {
                "empid":    work_no,
                "username": admin.name,
                "is_admin": True,
                "role_code": "system_admin",
                "location": location,
            }
            access_token = create_token(identity=work_no, additional_claims=identity)
            return {
                "access_token": access_token,
                "work_no":      work_no,
                "name":         admin.name,
                "role_code":    "system_admin",
                "role_name":    "系统管理员",
                "is_admin":     True,
                "is_supervisor": False,
            }

        # 2. 普通用户登录
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no, status=1).first()
        if not user:
            raise BusinessException(msg="用户不存在或已禁用", code="F20003")

        role_info = self.get_user_role(work_no) or {"role_code": None, "role_name": None}
        is_supervisor = db.session.query(HierarchyModel).filter_by(
            supervisor_work_no=work_no
        ).first() is not None

        identity = {
            "empid":    work_no,
            "username": user.name,
            "is_admin": False,
            "role_code": role_info["role_code"],
            "location": location,
        }
        access_token = create_token(identity=work_no, additional_claims=identity)
        return {
            "access_token": access_token,
            "work_no":      work_no,
            "name":         user.name,
            "role_code":    role_info["role_code"],
            "role_name":    role_info["role_name"],
            "is_admin":     False,
            "is_supervisor": is_supervisor,
        }

    def get_index_data(self, work_no: str) -> dict:
        """首页汇总统计"""
        from dbs.mysql_db.model_tables import (
            FunctionDataModel, TemporaryDutyModel, ReviewApplyModel
        )
        doing_task = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.developers.like(f"%{work_no}%"),
                    FunctionDataModel.function_status == 2).count()
        )
        unstart_task = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.developers.like(f"%{work_no}%"),
                    FunctionDataModel.function_status == 1).count()
        )
        doing_duty = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.responsible.like(f"%{work_no}%"),
                    TemporaryDutyModel.duty_status == 1).count()
        )
        unstart_duty = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.responsible.like(f"%{work_no}%"),
                    TemporaryDutyModel.duty_status == 0).count()
        )
        pending_project = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.duty_id.is_(None),
                    ReviewApplyModel.apply_status == 1).count()
        )
        pending_duty = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                    ReviewApplyModel.duty_id.isnot(None),
                    ReviewApplyModel.apply_status == 1).count()
        )
        return {
            "total_task_num": {
                "doing_task": doing_task, "unstart_task": unstart_task,
                "doing_duty": doing_duty, "unstart_duty": unstart_duty,
            },
            "total_progress_record_num": 0,
            "total_awaiting_review_num": {
                "project": pending_project, "duty": pending_duty,
            },
        }

    def get_statistical(self, work_no: str) -> dict:
        from dbs.mysql_db.model_tables import FunctionDataModel, TemporaryDutyModel, ProjectDataModel
        # ── 功能任务统计 ──────────────────────────────────────────────────────
        total_projects = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.developers.like(f"%{work_no}%")).count()
        )
        total_duties = (
            db.session.query(TemporaryDutyModel)
            .filter(TemporaryDutyModel.responsible.like(f"%{work_no}%")).count()
        )
        completed = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.developers.like(f"%{work_no}%"),
                    FunctionDataModel.function_status == 4).count()
        )
        in_progress = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.developers.like(f"%{work_no}%"),
                    FunctionDataModel.function_status == 2).count()
        )
        # ── 专案统计（project_pm / product_pm / creator 任一匹配即视为参与）──
        _proj_filter = db.or_(
            ProjectDataModel.project_pm == work_no,
            ProjectDataModel.product_pm == work_no,
            ProjectDataModel.creator    == work_no,
        )
        project_total = (
            db.session.query(ProjectDataModel)
            .filter(_proj_filter, ProjectDataModel.project_status.notin_([9])).count()
        )
        project_completed = (
            db.session.query(ProjectDataModel)
            .filter(_proj_filter, ProjectDataModel.project_status == 7).count()
        )
        project_in_progress = (
            db.session.query(ProjectDataModel)
            .filter(_proj_filter, ProjectDataModel.project_status == 5).count()
        )
        return {
            "total_projects": total_projects, "total_duties": total_duties,
            "completed": completed, "in_progress": in_progress,
            "project_total":       project_total,
            "project_completed":   project_completed,
            "project_in_progress": project_in_progress,
        }

    def get_team_statistical(self, work_no: str) -> dict:
        """团队统计（主管视角）：聚合所有下属的专案 / 任务 / 待处理数据"""
        import datetime
        from dbs.mysql_db.model_tables import (
            FunctionDataModel, TemporaryDutyModel, ProjectDataModel, ReviewApplyModel
        )

        subordinates = self.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        today        = datetime.date.today().strftime("%Y-%m-%d")
        today_plus7  = (datetime.date.today() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")

        # ── 团队专案统计 ────────────────────────────────────────────────────────
        all_members = [work_no] + sub_work_nos
        if all_members:
            proj_member_conds = [
                db.or_(
                    ProjectDataModel.project_pm == m,
                    ProjectDataModel.product_pm == m,
                    ProjectDataModel.creator    == m,
                )
                for m in all_members
            ]
            proj_filter = db.or_(*proj_member_conds)
        else:
            proj_filter = db.false()

        team_project_total       = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status.notin_([9])).count()
        team_project_in_progress = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status == 5).count()
        team_project_completed   = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status == 7).count()

        # ── 团队任务统计（仅下属） ───────────────────────────────────────────────
        if sub_work_nos:
            func_filter = db.or_(*[FunctionDataModel.developers.like(f"%{m}%")  for m in sub_work_nos])
            duty_filter = db.or_(*[TemporaryDutyModel.responsible.like(f"%{m}%") for m in sub_work_nos])
        else:
            func_filter = db.false()
            duty_filter = db.false()

        f = db.session.query(FunctionDataModel)
        d = db.session.query(TemporaryDutyModel)

        func_total       = f.filter(func_filter, FunctionDataModel.function_status.notin_([9])).count()
        duty_total       = d.filter(duty_filter, TemporaryDutyModel.duty_status.notin_([9])).count()
        func_in_prog     = f.filter(func_filter, FunctionDataModel.function_status == 2).count()
        duty_in_prog     = d.filter(duty_filter, TemporaryDutyModel.duty_status   == 1).count()
        func_not_start   = f.filter(func_filter, FunctionDataModel.function_status == 1).count()
        duty_not_start   = d.filter(duty_filter, TemporaryDutyModel.duty_status   == 0).count()
        func_completed   = f.filter(func_filter, FunctionDataModel.function_status == 4).count()
        duty_completed   = d.filter(duty_filter, TemporaryDutyModel.duty_status   == 3).count()

        func_overdue = f.filter(
            func_filter, FunctionDataModel.function_status.notin_([4, 9]),
            FunctionDataModel.expected_end_date.isnot(None),
            FunctionDataModel.expected_end_date != '',
            FunctionDataModel.expected_end_date <  today,
        ).count()
        duty_overdue = d.filter(
            duty_filter, TemporaryDutyModel.duty_status.notin_([3, 9]),
            TemporaryDutyModel.expected_end_date.isnot(None),
            TemporaryDutyModel.expected_end_date != '',
            TemporaryDutyModel.expected_end_date <  today,
        ).count()

        func_urgent = f.filter(
            func_filter, FunctionDataModel.function_status.notin_([4, 9]),
            FunctionDataModel.expected_end_date.isnot(None),
            FunctionDataModel.expected_end_date != '',
            FunctionDataModel.expected_end_date >= today,
            FunctionDataModel.expected_end_date <= today_plus7,
        ).count()
        duty_urgent = d.filter(
            duty_filter, TemporaryDutyModel.duty_status.notin_([3, 9]),
            TemporaryDutyModel.expected_end_date.isnot(None),
            TemporaryDutyModel.expected_end_date != '',
            TemporaryDutyModel.expected_end_date >= today,
            TemporaryDutyModel.expected_end_date <= today_plus7,
        ).count()

        # ── 待处理 ──────────────────────────────────────────────────────────────
        pending_review = db.session.query(ReviewApplyModel).filter(
            ReviewApplyModel.reviewer.like(f"%{work_no}%"),
            ReviewApplyModel.apply_status == 1,
        ).count()

        return {
            "team_project": {
                "total":       team_project_total,
                "in_progress": team_project_in_progress,
                "completed":   team_project_completed,
            },
            "team_task": {
                "total":       func_total       + duty_total,
                "in_progress": func_in_prog     + duty_in_prog,
                "not_started": func_not_start   + duty_not_start,
                "completed":   func_completed   + duty_completed,
                "overdue":     func_overdue     + duty_overdue,
                "urgent":      func_urgent      + duty_urgent,
            },
            "pending": {
                "review":           pending_review,
                "progress_update":  0,
            },
            "team_size": len(sub_work_nos),
        }

    def get_latest_news(self, work_no: str, page=1, size=10):
        """获取最新动态（审核通知）"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
            .order_by(ReviewApplyModel.created_at.desc())
        )
        total = q.count()
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [
                {
                    "id": r.id,
                    "apply_type": r.apply_type,
                    "apply_status": r.apply_status,
                    "submitter_name": r.submitter_name,
                    "description": r.description,
                    "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in items
            ],
        }

    def my_projects(self, work_no: str, page=1, size=20, status=None):
        """我的项目列表"""
        from dbs.mysql_db.model_tables import ProjectDataModel
        q = db.session.query(ProjectDataModel).filter(
            db.or_(
                ProjectDataModel.project_pm == work_no,
                ProjectDataModel.product_pm == work_no,
                ProjectDataModel.creator == work_no,
            ),
            ProjectDataModel.status == 1,
        )
        if status is not None:
            q = q.filter(ProjectDataModel.project_status == status)
        total = q.count()
        items = q.order_by(ProjectDataModel.created_at.desc()).offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [p.to_list_item() for p in items],
        }

    def my_duties(self, work_no: str, page=1, size=20, status=None):
        """我的临时任务列表"""
        from dbs.mysql_db.model_tables import TemporaryDutyModel
        q = db.session.query(TemporaryDutyModel).filter(
            db.or_(
                TemporaryDutyModel.creator == work_no,
                TemporaryDutyModel.responsible.like(f"%{work_no}%"),
            ),
            TemporaryDutyModel.status == 1,
        )
        if status is not None:
            q = q.filter(TemporaryDutyModel.duty_status == status)
        total = q.count()
        items = q.order_by(TemporaryDutyModel.created_at.desc()).offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [d.to_dict() for d in items],
        }

    def my_project_apply(self, work_no: str, page=1, size=20):
        """我的项目申请记录"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter_by(submitter=work_no)
            .filter(ReviewApplyModel.duty_id.is_(None))
            .order_by(ReviewApplyModel.created_at.desc())
        )
        total = q.count()
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [
                {
                    "id": r.id, "apply_type": r.apply_type,
                    "apply_status": r.apply_status, "project_id": r.project_id,
                    "description": r.description, "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in items
            ],
        }

    def my_duty_apply(self, work_no: str, page=1, size=20):
        """我的任务申请记录"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter_by(submitter=work_no)
            .filter(ReviewApplyModel.duty_id.isnot(None))
            .order_by(ReviewApplyModel.created_at.desc())
        )
        total = q.count()
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [
                {
                    "id": r.id, "apply_type": r.apply_type,
                    "apply_status": r.apply_status, "duty_id": r.duty_id,
                    "description": r.description, "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in items
            ],
        }

    def cancel_apply(self, apply_id: str, work_no: str):
        """撤回申请"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        apply = db.session.query(ReviewApplyModel).filter_by(id=apply_id, submitter=work_no).first()
        if not apply:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(msg="申请记录不存在")
        apply.apply_status = 0  # 0=已撤回
        db.session.commit()

    def project_audit_record(self, work_no: str, page=1, size=20):
        """项目审核记录（我作为审核人的记录）"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
            .filter(ReviewApplyModel.duty_id.is_(None))
            .order_by(ReviewApplyModel.created_at.desc())
        )
        total = q.count()
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [
                {
                    "id": r.id, "apply_type": r.apply_type,
                    "apply_status": r.apply_status, "project_id": r.project_id,
                    "submitter_name": r.submitter_name,
                    "description": r.description, "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in items
            ],
        }

    def duty_audit_record(self, work_no: str, page=1, size=20):
        """任务审核记录（我作为审核人的记录）"""
        from dbs.mysql_db.model_tables import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.reviewer.like(f"%{work_no}%"))
            .filter(ReviewApplyModel.duty_id.isnot(None))
            .order_by(ReviewApplyModel.created_at.desc())
        )
        total = q.count()
        items = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": [
                {
                    "id": r.id, "apply_type": r.apply_type,
                    "apply_status": r.apply_status, "duty_id": r.duty_id,
                    "submitter_name": r.submitter_name,
                    "description": r.description, "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in items
            ],
        }
