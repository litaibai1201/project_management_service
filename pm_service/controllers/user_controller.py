# -*- coding: utf-8 -*-
"""用户控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import (
    ResourceNotFoundException, ResourceExistsException, BusinessException
)
from dbs.mysql_db import db
from tables.user_table import (
    UserProfileModel, UserRoleModel, HierarchyModel, DepartmentModel,
)
from daos.user_dao import UserDAO

_dao = UserDAO()


class UserController:

    # ── 用户 CRUD ──────────────────────────────────────────────────────────────

    def list_users(self, page=1, size=20, keyword="", department=""):
        query = _dao.list_users_query(keyword=keyword, department=department)
        total = query.count()
        users = query.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [u.to_dict() for u in users],
        }

    def get_user(self, work_no: str):
        work_no = (work_no or "").strip().lower()
        user = _dao.find_by_work_no(work_no)
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        return user.to_dict()

    def create_user(self, payload: dict):
        from utils.exceptions import ValidationException
        work_no = (payload["work_no"] or "").strip().lower()
        if not work_no:
            raise ValidationException(msg="工号不能为空")
        if _dao.find_by_work_no(work_no, active_only=False):
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
        _dao.add(user)
        _dao.commit()
        return {"work_no": work_no}

    def update_user(self, work_no: str, payload: dict):
        user = _dao.find_by_work_no_exact(work_no)
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        for field in ("name", "department", "position", "email", "phone", "password", "location"):
            if field in payload and payload[field] is not None:
                setattr(user, field, payload[field])
        user.update_at = CommonTools.get_now()
        _dao.commit()

    def delete_user(self, work_no: str):
        user = _dao.find_by_work_no_exact(work_no)
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        user.status = 0
        user.status_update_at = CommonTools.get_now()
        _dao.commit()

    def get_departments(self):
        """返回部门表 + 用户记录里的部门 合并去重后的列表"""
        dept_rows = _dao.list_departments()
        dept_list = [{"id": d.id, "name": d.name} for d in dept_rows]
        user_depts = _dao.distinct_user_departments()
        existing_names = {d["name"] for d in dept_list}
        for name in sorted(user_depts - existing_names):
            dept_list.append({"id": None, "name": name})
        return dept_list

    def create_department(self, name: str):
        name = name.strip()
        if not name:
            raise BusinessException("部门名称不能为空")
        exists = _dao.find_department_by_name(name)
        if exists:
            raise ResourceExistsException(f"部门「{name}」已存在")
        dept = DepartmentModel(name=name)
        _dao.add_department(dept)
        return dept.to_dict()

    def delete_department(self, dept_id: str):
        dept = _dao.find_department_by_id(dept_id)
        if not dept:
            raise ResourceNotFoundException("部门不存在")
        _dao.delete_department(dept)

    # ── 上下级关系 ─────────────────────────────────────────────────────────────

    def set_relation(self, supervisor_work_no: str, subordinate_work_no: str):
        rel = HierarchyModel(
            supervisor_work_no=supervisor_work_no,
            subordinate_work_no=subordinate_work_no,
        )
        _dao.add(rel)
        _dao.commit()
        return rel.to_dict()

    def get_all_relations(self):
        """获取所有上下级关系（批量，供前端层级页面初始化）"""
        rels = _dao.list_all_hierarchy()
        work_nos = set()
        for r in rels:
            work_nos.add(r.supervisor_work_no)
            work_nos.add(r.subordinate_work_no)
        name_map = _dao.name_map(work_nos)
        return [
            {
                "id": r.id,
                "supervisor_work_no": r.supervisor_work_no,
                "supervisor_name": name_map.get((r.supervisor_work_no or "").lower(), r.supervisor_work_no),
                "subordinate_work_no": r.subordinate_work_no,
                "subordinate_name": name_map.get((r.subordinate_work_no or "").lower(), r.subordinate_work_no),
            }
            for r in rels
        ]

    def remove_relation(self, relation_id: str):
        rel = _dao.find_hierarchy_by_id(relation_id)
        if not rel:
            raise ResourceNotFoundException(resource_type="关系记录")
        _dao.delete(rel)
        _dao.commit()

    def get_subordinates(self, work_no: str, all_levels: bool = False):
        """获取直接下级（all_levels=True 时递归获取所有层级）"""
        result = []
        queue = [work_no]
        visited = set()
        while queue:
            cur = queue.pop(0)
            cur_lower = (cur or "").lower()
            if cur_lower in visited:
                continue
            visited.add(cur_lower)
            rels = _dao.find_subordinate_rels(cur)
            for r in rels:
                sub_wn = r.subordinate_work_no
                user = _dao.find_by_work_no(sub_wn)
                info = user.to_dict() if user else {"work_no": sub_wn, "name": sub_wn}
                result.append(info)
                if all_levels:
                    queue.append(sub_wn)
        return result

    def get_supervisors(self, work_no: str):
        rels = _dao.find_supervisor_rels(work_no)
        result = []
        for r in rels:
            user = _dao.find_by_work_no(r.supervisor_work_no)
            info = user.to_dict() if user else {"work_no": r.supervisor_work_no, "name": r.supervisor_work_no}
            result.append(info)
        return result

    def get_team_tree(self, work_no: str):
        """返回该用户为根的树形结构"""
        def build_node(wn, depth=0):
            if depth > 5:
                return None
            user = _dao.find_by_work_no(wn)
            node = user.to_dict() if user else {"work_no": wn, "name": wn}
            rels = _dao.find_subordinate_rels(wn)
            node["children"] = [
                build_node(r.subordinate_work_no, depth + 1)
                for r in rels
                if build_node(r.subordinate_work_no, depth + 1) is not None
            ]
            return node
        return build_node(work_no)

    # ── 角色管理 ───────────────────────────────────────────────────────────────

    def assign_role(self, work_no: str, role_code: str):
        existing = _dao.find_user_role_record(work_no)
        if existing:
            existing.role_code = role_code
        else:
            _dao.add(UserRoleModel(work_no=work_no, role_code=role_code))
        _dao.commit()

    def remove_role(self, work_no: str):
        _dao.delete_role_by_work_no(work_no)

    def get_user_role(self, work_no: str):
        row = _dao.find_user_role(work_no)
        if not row:
            return None
        ur, role = row
        return {"role_code": role.code, "role_name": role.name}

    # ── 登录 & 首页统计 ────────────────────────────────────────────────────────

    def login(self, work_no: str, password: str, location: str = "") -> dict:
        """登录验证：优先检查管理员表，再检查普通用户表"""
        work_no = (work_no or "").strip().lower()
        from utils.auth import create_token

        # 1. 优先检查管理员表
        admin = _dao.find_admin_by_username(work_no)
        if admin:
            if admin.password != password:
                raise BusinessException(msg="密码错误", code="F20003")
            admin.last_login = CommonTools.get_now()
            _dao.commit()
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
                "department":   "",
                "role_code":    "system_admin",
                "role_name":    "系统管理员",
                "is_admin":     True,
                "is_supervisor": False,
            }

        # 2. 普通用户登录
        import os
        use_ldap = os.environ.get("AUTH_USE_LDAP", "false").lower() in ("1", "true", "yes")

        user = _dao.find_by_work_no_exact(work_no)

        if use_ldap:
            # LDAP 模式：先验证身份，首次登录时自动创建用户
            self._verify_ldap(work_no, password, location)
            if not user:
                # 第一次登录：从 LDAP 接口获取姓名，失败时暂用工号
                real_name = self._fetch_ldap_name(work_no) or work_no
                user = UserProfileModel(
                    work_no=work_no,
                    name=real_name,
                    location=location,
                    password=password,  # 保存密码，目的是不使用ldap时也能登录，只需校验密码
                )
                _dao.add(user)
                _dao.commit()
            elif user.name == work_no:
                # 姓名仍为工号（上次获取失败），再次尝试修正
                real_name = self._fetch_ldap_name(work_no)
                if real_name and real_name != work_no:
                    user.name = real_name
                    _dao.commit()
        else:
            if not user:
                raise BusinessException(msg="用户不存在或已禁用", code="F20003")
            if user.password != password:
                raise BusinessException(msg="密码错误", code="F20003")

        role_info = self.get_user_role(work_no) or {"role_code": None, "role_name": None}
        is_supervisor = _dao.is_supervisor(work_no)

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
            "department":   user.department or "",
            "role_code":    role_info["role_code"],
            "role_name":    role_info["role_name"],
            "is_admin":     False,
            "is_supervisor": is_supervisor,
        }

    def _verify_ldap(self, work_no: str, password: str, location: str = "") -> None:
        """调用第三方 LDAP 接口验证身份；失败时抛出 BusinessException"""
        import os
        import requests
        api_base = (os.environ.get("LDAP_API_BASE") or "").rstrip("/")
        if not api_base:
            raise BusinessException(msg="LDAP 服务未配置，无法登录", code="F20003")

        payload = {
            "service_name": os.environ.get("LDAP_SERVICE_NAME", ""),
            "location":     location or os.environ.get("LDAP_LOCATION", "TW"),
            "work_no":      work_no,
            "password":     password,
        }
        try:
            resp = requests.post(
                f"{api_base}/api/ldaplogin",
                json=payload,
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
        except requests.exceptions.Timeout:
            raise BusinessException(msg="LDAP 服务连接超时，请稍后重试", code="F20003")
        except Exception as exc:
            raise BusinessException(msg=f"LDAP 服务异常：{exc}", code="F20003")

        if result.get("code") != "S10000":
            raise BusinessException(msg="工号或密码错误", code="F20003")

    def _fetch_ldap_name(self, work_no: str) -> str:
        """调用第三方接口批量查询工号对应姓名，返回该工号的姓名；失败时返回空字符串"""
        import os
        import requests
        api_base = (os.environ.get("LDAP_API_BASE") or "").rstrip("/")
        if not api_base:
            return ""
        try:
            resp = requests.post(
                f"{api_base}/api/searchNameEmpid",
                json={"empids": [work_no.upper()]},
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
            if result.get("code") == "S10000":
                return result.get("content", {}).get(work_no.upper(), "")
        except Exception:
            pass
        return ""

    def get_index_data(self, work_no: str) -> dict:
        """首页汇总统计"""
        from tables.function_table import FunctionDataModel
        from tables.duty_table import TemporaryDutyModel
        from tables.review_table import ReviewApplyModel
        wn_lower = work_no.lower()
        resp_pat = f'%"{wn_lower}"%'
        doing_task = (
            db.session.query(FunctionDataModel)
            .filter(db.func.lower(FunctionDataModel.responsible).like(resp_pat),
                    FunctionDataModel.function_status == 2).count()
        )
        unstart_task = (
            db.session.query(FunctionDataModel)
            .filter(db.func.lower(FunctionDataModel.responsible).like(resp_pat),
                    FunctionDataModel.function_status == 1).count()
        )
        doing_duty = (
            db.session.query(TemporaryDutyModel)
            .filter(db.func.lower(TemporaryDutyModel.responsible).like(resp_pat),
                    TemporaryDutyModel.duty_status == 1).count()
        )
        unstart_duty = (
            db.session.query(TemporaryDutyModel)
            .filter(db.func.lower(TemporaryDutyModel.responsible).like(resp_pat),
                    TemporaryDutyModel.duty_status == 0).count()
        )
        # 待审批计数：需解析 approval_nodes_json 判断是否轮到当前用户
        import json as _json
        from sqlalchemy import or_
        pending_reviews = (
            db.session.query(ReviewApplyModel.duty_id, ReviewApplyModel.approval_nodes_json)
            .filter(
                or_(
                    db.func.lower(ReviewApplyModel.reviewer).like(f"%{wn_lower}%"),
                    ReviewApplyModel.approval_nodes_json.like(f"%{wn_lower}%"),
                ),
                ReviewApplyModel.apply_status == 1,
            ).all()
        )
        pending_project = 0
        pending_duty = 0
        for duty_id, nodes_json in pending_reviews:
            if not nodes_json:
                continue
            try:
                nodes = _json.loads(nodes_json)
            except Exception:
                continue
            sorted_nodes = sorted(nodes, key=lambda n: n.get("order", 0))
            first_pending = next((n for n in sorted_nodes if n.get("status") == 0), None)
            if not first_pending:
                continue
            if first_pending.get("approver_work_no", "").lower() != wn_lower:
                continue
            if duty_id:
                pending_duty += 1
            else:
                pending_project += 1
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
        from tables.function_table import FunctionDataModel
        from tables.duty_table import TemporaryDutyModel
        from tables.project_table import ProjectDataModel
        wn_lower = work_no.lower()
        resp_pat = f'%"{wn_lower}"%'
        # 功能任务：按负责人筛选
        func_filter = db.func.lower(FunctionDataModel.responsible).like(resp_pat)
        # AR/系统任务：按负责人或创建人筛选
        duty_filter = db.or_(
            db.func.lower(TemporaryDutyModel.responsible).like(resp_pat),
            db.func.lower(TemporaryDutyModel.creator) == wn_lower,
        )
        # ── 功能任务统计 ──────────────────────────────────────────────────────
        total_projects = (
            db.session.query(FunctionDataModel)
            .filter(func_filter, FunctionDataModel.function_status.notin_([9])).count()
        )
        total_duties = (
            db.session.query(TemporaryDutyModel)
            .filter(duty_filter, TemporaryDutyModel.duty_status.notin_([9])).count()
        )
        completed = (
            db.session.query(FunctionDataModel)
            .filter(func_filter, FunctionDataModel.function_status == 4).count()
        )
        in_progress = (
            db.session.query(FunctionDataModel)
            .filter(func_filter, FunctionDataModel.function_status == 2).count()
        )
        # ── 专案统计 ──────────────────────────────────────────────────────────
        resp_proj_ids = (
            db.session.query(FunctionDataModel.project_id)
            .filter(db.func.lower(FunctionDataModel.responsible).like(resp_pat),
                    FunctionDataModel.function_status.notin_([9]))
            .distinct()
            .subquery()
        )
        _proj_filter = db.or_(
            db.func.lower(ProjectDataModel.project_pm) == wn_lower,
            db.func.lower(ProjectDataModel.product_pm) == wn_lower,
            db.func.lower(ProjectDataModel.creator)    == wn_lower,
            ProjectDataModel.id.in_(resp_proj_ids),
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
        duty_completed = (
            db.session.query(TemporaryDutyModel)
            .filter(duty_filter, TemporaryDutyModel.duty_status == 3).count()
        )
        duty_in_progress = (
            db.session.query(TemporaryDutyModel)
            .filter(duty_filter, TemporaryDutyModel.duty_status.in_([1, 2, 5, 6])).count()
        )
        return {
            "total_projects": total_projects, "total_duties": total_duties,
            "completed": completed + duty_completed,
            "in_progress": in_progress + duty_in_progress,
            "func_completed": completed, "func_in_progress": in_progress,
            "duty_completed": duty_completed, "duty_in_progress": duty_in_progress,
            "project_total":       project_total,
            "project_completed":   project_completed,
            "project_in_progress": project_in_progress,
        }

    def get_team_statistical(self, work_no: str) -> dict:
        """团队统计（主管视角）：聚合所有下属的专案 / 任务 / 待处理数据"""
        import datetime
        from tables.function_table import FunctionDataModel
        from tables.duty_table import TemporaryDutyModel
        from tables.project_table import ProjectDataModel
        from tables.review_table import ReviewApplyModel
        from tables.requirement_table import RequirementModel
        from tables.standalone_req_table import StandaloneReqModel

        subordinates = self.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        today        = datetime.date.today().strftime("%Y-%m-%d")
        today_plus7  = (datetime.date.today() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")

        # 主管本人 + 所有层级下属（统一小写用于匹配）
        all_members = [work_no] + sub_work_nos
        all_members_lower = [m.lower() for m in all_members]

        # ── 团队专案统计 ────────────────────────────────────────────────────────
        # 参与定义：专案PM / 产品PM / 创建者 / 功能任务负责人（任一满足即算参与）
        if all_members:
            # 专案级角色（大小写不敏感）
            proj_role_conds = [
                db.or_(
                    db.func.lower(ProjectDataModel.project_pm) == m,
                    db.func.lower(ProjectDataModel.product_pm) == m,
                    db.func.lower(ProjectDataModel.creator)    == m,
                )
                for m in all_members_lower
            ]
            # 通过功能任务参与的专案（大小写不敏感）
            resp_func_conds = [db.func.lower(FunctionDataModel.responsible).like(f'%"{m}"%') for m in all_members_lower]
            dev_proj_ids = (
                db.session.query(FunctionDataModel.project_id)
                .filter(db.or_(*resp_func_conds),
                        FunctionDataModel.function_status.notin_([9]))
                .distinct()
                .subquery()
            )
            proj_filter = db.or_(
                *proj_role_conds,
                ProjectDataModel.id.in_(dev_proj_ids),
            )
        else:
            proj_filter = db.false()

        team_project_total       = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status.notin_([1, 9])).count()
        team_project_planning    = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status.in_([2, 3, 4, 10, 11])).count()
        team_project_in_progress = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status.in_([5, 6])).count()
        team_project_completed   = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status == 7).count()
        team_project_suspended   = db.session.query(ProjectDataModel).filter(proj_filter, ProjectDataModel.project_status == 8).count()

        # ── 团队任务统计（主管本人 + 所有下属） ──────────────────────────────────
        if all_members:
            func_filter = db.or_(*[db.func.lower(FunctionDataModel.responsible).like(f'%"{m}"%') for m in all_members_lower])
            duty_filter = db.or_(*[db.func.lower(TemporaryDutyModel.responsible).like(f'%"{m}"%') for m in all_members_lower])
        else:
            func_filter = db.false()
            duty_filter = db.false()

        f = db.session.query(FunctionDataModel)
        d = db.session.query(TemporaryDutyModel)

        # 系统任务筛选条件（有 standalone_req_id）
        sys_duty_filter = db.and_(duty_filter, TemporaryDutyModel.standalone_req_id.isnot(None),
                                  TemporaryDutyModel.standalone_req_id != '')
        # AR 任务筛选条件（无 standalone_req_id）
        ar_duty_filter = db.and_(duty_filter, db.or_(
            TemporaryDutyModel.standalone_req_id.is_(None),
            TemporaryDutyModel.standalone_req_id == '',
        ))

        # 总计排除草稿和删除
        func_total       = f.filter(func_filter, FunctionDataModel.function_status.notin_([0, 9])).count()
        duty_total       = d.filter(sys_duty_filter, TemporaryDutyModel.duty_status.notin_([0, 9])).count()
        # 进行中：包含进行中+完结审核+审核中
        func_in_prog     = f.filter(func_filter, FunctionDataModel.function_status.in_([2, 3])).count()
        duty_in_prog     = d.filter(sys_duty_filter, TemporaryDutyModel.duty_status.in_([1, 2, 5])).count()
        # 未开始
        func_not_start   = f.filter(func_filter, FunctionDataModel.function_status == 1).count()
        duty_not_start   = d.filter(sys_duty_filter, TemporaryDutyModel.duty_status == 6).count()
        # 已完结
        func_completed   = f.filter(func_filter, FunctionDataModel.function_status == 4).count()
        duty_completed   = d.filter(sys_duty_filter, TemporaryDutyModel.duty_status == 3).count()
        # 搁置
        func_suspended   = f.filter(func_filter, FunctionDataModel.function_status == 8).count()
        duty_suspended   = d.filter(sys_duty_filter, TemporaryDutyModel.duty_status == 8).count()

        # AR 任务单独统计（总计排除草稿和删除，进行中包含审核中）
        ar_total       = d.filter(ar_duty_filter, TemporaryDutyModel.duty_status.notin_([0, 9])).count()
        ar_in_prog     = d.filter(ar_duty_filter, TemporaryDutyModel.duty_status.in_([1, 2, 5])).count()
        ar_not_start   = d.filter(ar_duty_filter, TemporaryDutyModel.duty_status == 6).count()
        ar_completed   = d.filter(ar_duty_filter, TemporaryDutyModel.duty_status == 3).count()
        ar_suspended   = d.filter(ar_duty_filter, TemporaryDutyModel.duty_status == 8).count()

        # 超时/临期排除草稿（function_status=0）和已完结/删除
        func_overdue = f.filter(
            func_filter, FunctionDataModel.function_status.notin_([0, 4, 9]),
            FunctionDataModel.expected_end_date.isnot(None),
            FunctionDataModel.expected_end_date != '',
            FunctionDataModel.expected_end_date <  today,
        ).count()
        duty_overdue = d.filter(
            sys_duty_filter, TemporaryDutyModel.duty_status.notin_([0, 3, 9]),
            TemporaryDutyModel.expected_end_date.isnot(None),
            TemporaryDutyModel.expected_end_date != '',
            TemporaryDutyModel.expected_end_date <  today,
        ).count()
        ar_overdue = d.filter(
            ar_duty_filter, TemporaryDutyModel.duty_status.notin_([0, 3, 9]),
            TemporaryDutyModel.expected_end_date.isnot(None),
            TemporaryDutyModel.expected_end_date != '',
            TemporaryDutyModel.expected_end_date <  today,
        ).count()

        func_urgent = f.filter(
            func_filter, FunctionDataModel.function_status.notin_([0, 4, 9]),
            FunctionDataModel.expected_end_date.isnot(None),
            FunctionDataModel.expected_end_date != '',
            FunctionDataModel.expected_end_date >= today,
            FunctionDataModel.expected_end_date <= today_plus7,
        ).count()
        duty_urgent = d.filter(
            duty_filter, TemporaryDutyModel.duty_status.notin_([0, 3, 9]),
            TemporaryDutyModel.expected_end_date.isnot(None),
            TemporaryDutyModel.expected_end_date != '',
            TemporaryDutyModel.expected_end_date >= today,
            TemporaryDutyModel.expected_end_date <= today_plus7,
        ).count()

        # ── 待处理（需判断 is_my_turn）─────────────────────────────────────────
        import json as _json2
        from sqlalchemy import or_ as _or
        _pending_rows = db.session.query(ReviewApplyModel.approval_nodes_json).filter(
            _or(
                db.func.lower(ReviewApplyModel.reviewer).like(f"%{work_no.lower()}%"),
                ReviewApplyModel.approval_nodes_json.like(f"%{work_no.lower()}%"),
            ),
            ReviewApplyModel.apply_status == 1,
        ).all()
        pending_review = 0
        for (nodes_json,) in _pending_rows:
            if not nodes_json:
                continue
            try:
                _nodes = _json2.loads(nodes_json)
            except Exception:
                continue
            _sorted = sorted(_nodes, key=lambda n: n.get("order", 0))
            _first = next((n for n in _sorted if n.get("status") == 0), None)
            if _first and _first.get("approver_work_no", "").lower() == work_no.lower():
                pending_review += 1

        # ── 效益统计（按单位分组，仅统计当年完结专案 + 当年完结独立需求）──────
        current_year = str(CommonTools.get_now("datetime").year)

        # 查询当年完结专案
        team_projects_for_benefit = db.session.query(ProjectDataModel).filter(
            proj_filter,
            ProjectDataModel.project_status == 7,
            ProjectDataModel.end_time.like(f"{current_year}%"),
        ).all()

        # 预取所有相关专案下标记为追加需求(is_addon=True)的效益（一次查询，避免 N+1）
        all_proj_ids = [p.id for p in team_projects_for_benefit]
        req_benefit_by_proj: dict = {}
        if all_proj_ids:
            addon_reqs = db.session.query(RequirementModel).filter(
                RequirementModel.project_id.in_(all_proj_ids),
                RequirementModel.req_status != 9,
                RequirementModel.is_addon == True,
                RequirementModel.benefit_amount.isnot(None),
                RequirementModel.benefit_amount > 0,
            ).all()
            for r in addon_reqs:
                req_benefit_by_proj.setdefault(r.project_id, []).append(r)

        def _ensure_unit(bmap: dict, unit: str):
            if unit not in bmap:
                bmap[unit] = {
                    "expected": 0.0, "actual": 0.0,
                    "proj_expected": 0.0, "addon_expected": 0.0, "standalone_expected": 0.0,
                    "proj_count": 0, "addon_count": 0, "standalone_count": 0,
                    "projects": [],
                }

        benefit_map: dict = {}

        # 构建专案 id -> project_nm 映射，供追加需求引用
        proj_nm_map = {p.id: p.project_nm for p in team_projects_for_benefit}

        for proj in team_projects_for_benefit:
            proj_benefit = proj.benefit_amount or 0
            addon_reqs   = req_benefit_by_proj.get(proj.id, [])

            # ── 专案层效益 ────────────────────────────────────────────────────
            if proj_benefit > 0:
                unit = (proj.benefit_unit or "元/年").strip()
                _ensure_unit(benefit_map, unit)
                benefit_map[unit]["expected"]      += proj_benefit
                benefit_map[unit]["proj_expected"] += proj_benefit
                benefit_map[unit]["proj_count"]    += 1
                if proj.actual_benefit_amount is not None:
                    benefit_map[unit]["actual"] += proj.actual_benefit_amount
                benefit_map[unit]["projects"].append({
                    "id":       proj.id,
                    "name":     proj.project_nm,
                    "status":   proj.project_status,
                    "expected": round(proj_benefit, 2),
                    "actual":   round(proj.actual_benefit_amount, 2) if proj.actual_benefit_amount is not None else None,
                    "type":     "project",
                })

            # ── 追加需求层效益（每条需求独立记录）───────────────────────────
            for r in addon_reqs:
                r_benefit = r.benefit_amount or 0
                if r_benefit <= 0:
                    continue
                unit = (r.benefit_unit or "元/年").strip()
                _ensure_unit(benefit_map, unit)
                benefit_map[unit]["expected"]       += r_benefit
                benefit_map[unit]["addon_expected"] += r_benefit
                benefit_map[unit]["addon_count"]    += 1
                benefit_map[unit]["projects"].append({
                    "id":       r.id,
                    "name":     f"{r.req_nm}（{proj_nm_map.get(r.project_id, '')}）",
                    "status":   r.req_status,
                    "expected": round(r_benefit, 2),
                    "actual":   None,
                    "type":     "addon_req",
                    "proj_id":  r.project_id,
                })

        # ── 系统独立需求效益（当年完结）─────────────────────────────────────
        standalone_reqs_benefit = db.session.query(StandaloneReqModel).filter(
            StandaloneReqModel.req_status == 4,
            StandaloneReqModel.benefit_amount.isnot(None),
            StandaloneReqModel.benefit_amount > 0,
            db.or_(
                StandaloneReqModel.expected_end_date.like(f"{current_year}%"),
                StandaloneReqModel.updated_at.like(f"{current_year}%"),
            ),
        ).all()

        for req in standalone_reqs_benefit:
            unit = (req.benefit_unit or "元/年").strip()
            _ensure_unit(benefit_map, unit)
            benefit_map[unit]["expected"]            += req.benefit_amount or 0
            benefit_map[unit]["standalone_expected"] += req.benefit_amount or 0
            benefit_map[unit]["standalone_count"]    += 1
            benefit_map[unit]["projects"].append({
                "id":       req.id,
                "name":     req.req_nm,
                "status":   req.req_status,
                "expected": round(req.benefit_amount or 0, 2),
                "actual":   None,
                "type":     "standalone_req",
            })

        team_benefit = [
            {
                "unit":                unit,
                "expected":            round(v["expected"], 2),
                "actual":              round(v["actual"],   2),
                "proj_expected":       round(v["proj_expected"],       2),
                "addon_expected":      round(v["addon_expected"],      2),
                "standalone_expected": round(v["standalone_expected"], 2),
                "proj_count":          v["proj_count"],
                "addon_count":         v["addon_count"],
                "standalone_count":    v["standalone_count"],
                "count":               v["proj_count"] + v["addon_count"] + v["standalone_count"],
                "projects":            v["projects"],
            }
            for unit, v in benefit_map.items()
        ]

        return {
            "team_project": {
                "total":       team_project_total,
                "planning":    team_project_planning,
                "in_progress": team_project_in_progress,
                "completed":   team_project_completed,
                "suspended":   team_project_suspended,
            },
            "team_task": {
                "total":       func_total       + duty_total,
                "in_progress": func_in_prog     + duty_in_prog,
                "not_started": func_not_start   + duty_not_start,
                "completed":   func_completed   + duty_completed,
                "suspended":   func_suspended   + duty_suspended,
                "overdue":     func_overdue     + duty_overdue,
            },
            "team_ar_task": {
                "total":       ar_total,
                "in_progress": ar_in_prog,
                "not_started": ar_not_start,
                "completed":   ar_completed,
                "overdue":     ar_overdue,
                "suspended":   ar_suspended,
            },
            "pending": {
                "review":           pending_review,
                "progress_update":  0,
            },
            "team_size": len(sub_work_nos),
            "team_benefit": team_benefit,
        }

    def get_alert_tasks(self, work_no: str) -> list:
        """返回当前用户7天内到期或已超期的功能任务 / AR"""
        import datetime
        from tables.function_table import FunctionDataModel
        from tables.duty_table import TemporaryDutyModel
        from tables.project_table import ProjectDataModel

        today_dt   = datetime.date.today()
        threshold  = (today_dt + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
        today      = today_dt.strftime("%Y-%m-%d")
        resp_pat   = f'%"{work_no.lower()}"%'

        funcs = (
            db.session.query(FunctionDataModel)
            .filter(
                db.func.lower(FunctionDataModel.responsible).like(resp_pat),
                FunctionDataModel.function_status.in_([1, 2]),
                FunctionDataModel.expected_end_date.isnot(None),
                FunctionDataModel.expected_end_date != "",
                FunctionDataModel.expected_end_date <= threshold,
            ).all()
        )
        duties = (
            db.session.query(TemporaryDutyModel)
            .filter(
                db.func.lower(TemporaryDutyModel.responsible).like(resp_pat),
                TemporaryDutyModel.duty_status.in_([1]),
                TemporaryDutyModel.expected_end_date.isnot(None),
                TemporaryDutyModel.expected_end_date != "",
                TemporaryDutyModel.expected_end_date <= threshold,
            ).all()
        )

        project_ids = list({f.project_id for f in funcs})
        project_map: dict = {}
        if project_ids:
            projs = db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(project_ids)).all()
            project_map = {p.id: p.project_nm for p in projs}

        result = []
        for f in funcs:
            end = datetime.date.fromisoformat(f.expected_end_date)
            result.append({
                "id": f.id,
                "name": f.function_nm,
                "type": "function",
                "project_id": f.project_id,
                "project_nm": project_map.get(f.project_id, ""),
                "responsible": work_no,
                "expected_end_date": f.expected_end_date,
                "days_diff": (end - today_dt).days,
            })
        for d in duties:
            end = datetime.date.fromisoformat(d.expected_end_date)
            result.append({
                "id": d.id,
                "name": d.duty_nm,
                "type": "duty",
                "project_nm": None,
                "responsible": work_no,
                "expected_end_date": d.expected_end_date,
                "days_diff": (end - today_dt).days,
            })
        return result

    def get_weekly_activity(self, work_no: str) -> list:
        """返回本周（周一到周日）每天的进度更新条数"""
        import datetime
        from tables.function_table import ProgressRecordDataModel
        from tables.duty_table import DutyProgressRecordModel

        today    = datetime.date.today()
        mon      = today - datetime.timedelta(days=today.weekday())   # 本周一
        week_start = mon.strftime("%Y-%m-%d")
        week_end   = (mon + datetime.timedelta(days=6)).strftime("%Y-%m-%d")

        # 查询本周该用户提交或作为合作者的功能进度记录
        proj_recs = (
            db.session.query(ProgressRecordDataModel)
            .filter(
                db.or_(
                    ProgressRecordDataModel.submitter == work_no,
                    ProgressRecordDataModel.cooperator.like(f'%"{work_no}"%'),
                ),
                ProgressRecordDataModel.created_at >= week_start,
                ProgressRecordDataModel.created_at <= week_end + " 23:59:59",
            ).all()
        )
        # 查询本周该用户提交或作为合作者的任务进度记录
        duty_recs = (
            db.session.query(DutyProgressRecordModel)
            .filter(
                db.or_(
                    DutyProgressRecordModel.submitter == work_no,
                    DutyProgressRecordModel.cooperator.like(f'%"{work_no}"%'),
                ),
                DutyProgressRecordModel.created_at >= week_start,
                DutyProgressRecordModel.created_at <= week_end + " 23:59:59",
            ).all()
        )

        DOW = ['一', '二', '三', '四', '五', '六', '日']
        proj_by_day: dict = {i: 0 for i in range(7)}
        duty_by_day: dict = {i: 0 for i in range(7)}

        for r in proj_recs:
            date_str = str(r.created_at)[:10]
            try:
                d = datetime.date.fromisoformat(date_str)
                proj_by_day[d.weekday()] += 1
            except Exception:
                pass
        for r in duty_recs:
            date_str = str(r.created_at)[:10]
            try:
                d = datetime.date.fromisoformat(date_str)
                duty_by_day[d.weekday()] += 1
            except Exception:
                pass

        return [
            {
                "day": DOW[i],
                "date": (mon + datetime.timedelta(days=i)).strftime("%m/%d"),
                "project": proj_by_day[i],
                "duty": duty_by_day[i],
            }
            for i in range(7)
        ]

    def get_latest_news(self, work_no: str, page=1, size=10):
        """获取近期动态：进度更新 + 审核提交，按时间倒序"""
        from tables.function_table import ProgressRecordDataModel, FunctionDataModel
        from tables.duty_table import DutyProgressRecordModel, TemporaryDutyModel
        from tables.review_table import ReviewApplyModel
        from tables.project_table import ProjectDataModel

        entries = []

        # ── 功能任务进度更新（该用户提交的）─────────────────────────────────
        proj_recs = (
            db.session.query(ProgressRecordDataModel)
            .filter(ProgressRecordDataModel.submitter == work_no)
            .order_by(ProgressRecordDataModel.created_at.desc())
            .limit(20).all()
        )
        func_ids = list({r.function_id for r in proj_recs})
        func_map: dict = {}
        if func_ids:
            funcs = db.session.query(FunctionDataModel).filter(FunctionDataModel.id.in_(func_ids)).all()
            func_map = {f.id: f.function_nm for f in funcs}
        for r in proj_recs:
            entries.append({
                "id": r.progress_id,
                "action": "提交了進度更新",
                "subject": func_map.get(r.function_id, "功能任務"),
                "type": "progress",
                "created_at": str(r.created_at) if r.created_at else "",
            })

        # ── AR进度更新（该用户提交的）─────────────────────────────────
        duty_recs = (
            db.session.query(DutyProgressRecordModel)
            .filter(DutyProgressRecordModel.submitter == work_no)
            .order_by(DutyProgressRecordModel.created_at.desc())
            .limit(20).all()
        )
        duty_ids = list({r.duty_id for r in duty_recs})
        duty_map: dict = {}
        if duty_ids:
            duties = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.id.in_(duty_ids)).all()
            duty_map = {d.id: d.duty_nm for d in duties}
        for r in duty_recs:
            entries.append({
                "id": r.id,
                "action": "提交了任務進度",
                "subject": duty_map.get(r.duty_id, "AR"),
                "type": "duty_progress",
                "created_at": str(r.created_at) if r.created_at else "",
            })

        # ── 审核申请（该用户提交的）─────────────────────────────────────────
        reviews = (
            db.session.query(ReviewApplyModel)
            .filter(ReviewApplyModel.submitter == work_no)
            .order_by(ReviewApplyModel.created_at.desc())
            .limit(20).all()
        )
        # 批量获取关联名称
        rev_proj_ids  = [r.project_id  for r in reviews if r.project_id]
        rev_func_ids  = [r.function_id for r in reviews if r.function_id]
        rev_duty_ids  = [r.duty_id     for r in reviews if r.duty_id]
        rev_proj_map: dict = {}
        rev_func_map: dict = {}
        rev_duty_map: dict = {}
        if rev_proj_ids:
            for p in db.session.query(ProjectDataModel).filter(ProjectDataModel.id.in_(rev_proj_ids)).all():
                rev_proj_map[p.id] = p.project_nm
        if rev_func_ids:
            for f in db.session.query(FunctionDataModel).filter(FunctionDataModel.id.in_(rev_func_ids)).all():
                rev_func_map[f.id] = f.function_nm
        if rev_duty_ids:
            for d in db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.id.in_(rev_duty_ids)).all():
                rev_duty_map[d.id] = d.duty_nm

        STATUS_LABEL = {1: "審核中", 2: "已通過", 3: "已拒絕", 4: "已退回"}
        for r in reviews:
            subject = (
                rev_func_map.get(r.function_id or "")
                or rev_proj_map.get(r.project_id or "")
                or rev_duty_map.get(r.duty_id or "")
                or ""
            )
            entries.append({
                "id": r.id,
                "action": f"提交了{r.apply_type or '審核申請'}",
                "subject": subject,
                "type": "review",
                "status": STATUS_LABEL.get(r.apply_status, ""),
                "created_at": str(r.created_at) if r.created_at else "",
            })

        # ── 按时间倒序排列并分页 ─────────────────────────────────────────────
        entries.sort(key=lambda x: x["created_at"], reverse=True)
        total = len(entries)
        page_data = entries[(page - 1) * size: page * size]
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": page_data,
        }

    def my_projects(self, work_no: str, page=1, size=20, status=None):
        """我的项目列表"""
        from tables.project_table import ProjectDataModel
        wn_lower = work_no.lower()
        q = db.session.query(ProjectDataModel).filter(
            db.or_(
                db.func.lower(ProjectDataModel.project_pm) == wn_lower,
                db.func.lower(ProjectDataModel.product_pm) == wn_lower,
                db.func.lower(ProjectDataModel.creator) == wn_lower,
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
        """我的AR列表"""
        from tables.duty_table import TemporaryDutyModel
        wn_lower = work_no.lower()
        q = db.session.query(TemporaryDutyModel).filter(
            db.or_(
                db.func.lower(TemporaryDutyModel.creator) == wn_lower,
                db.func.lower(TemporaryDutyModel.responsible).like(f"%{wn_lower}%"),
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
        from tables.review_table import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(db.func.lower(ReviewApplyModel.submitter) == (work_no or "").lower())
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
        from tables.review_table import ReviewApplyModel
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
        from tables.review_table import ReviewApplyModel
        apply = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.id == apply_id, db.func.lower(ReviewApplyModel.submitter) == (work_no or "").lower()).first()
        if not apply:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(msg="申请记录不存在")
        apply.apply_status = 0  # 0=已撤回
        _dao.commit()

    def project_audit_record(self, work_no: str, page=1, size=20):
        """项目审核记录（我作为审核人的记录）"""
        from tables.review_table import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(db.func.lower(ReviewApplyModel.reviewer).like(f"%{work_no.lower()}%"))
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
        from tables.review_table import ReviewApplyModel
        q = (
            db.session.query(ReviewApplyModel)
            .filter(db.func.lower(ReviewApplyModel.reviewer).like(f"%{work_no.lower()}%"))
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
