# -*- coding: utf-8 -*-
"""
@文件: user_dao.py
@说明: 用户 DAO
"""
from dbs.mysql_db import db
from tables.user_table import (
    UserProfileModel, DepartmentModel, RoleModel, UserRoleModel, HierarchyModel, AdminUserModel,
)
from .base_dao import BaseDAO


class UserDAO(BaseDAO):
    model = UserProfileModel

    # ── UserProfile 查询 ────────────────────────────────────────────────────

    def find_by_work_no(self, work_no: str, active_only: bool = True):
        """按工号查找用户（大小写不敏感）"""
        q = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no) == (work_no or "").lower()
        )
        if active_only:
            q = q.filter(UserProfileModel.status == 1)
        return q.first()

    def find_by_work_no_exact(self, work_no: str, active_only: bool = True):
        """按工号精确查找（区分大小写）"""
        q = db.session.query(UserProfileModel).filter_by(work_no=work_no)
        if active_only:
            q = q.filter(UserProfileModel.status == 1)
        return q.first()

    def list_users_query(self, keyword: str = "", department: str = ""):
        """构建用户列表查询（带过滤），返回 query 对象"""
        q = db.session.query(UserProfileModel).filter(UserProfileModel.status == 1)
        if keyword:
            q = q.filter(
                db.or_(
                    UserProfileModel.work_no.like(f"%{keyword}%"),
                    UserProfileModel.name.like(f"%{keyword}%"),
                )
            )
        if department:
            q = q.filter(UserProfileModel.department == department)
        return q

    def name_map(self, work_nos: set) -> dict:
        """批量工号 → 姓名映射（大小写不敏感），返回 {work_no_lower: name}"""
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u.name for u in users}

    def user_map(self, work_nos: set) -> dict:
        """批量工号 → UserProfileModel 映射（大小写不敏感），返回 {work_no_lower: user}"""
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u for u in users}

    # ── Department ──────────────────────────────────────────────────────────

    def list_departments(self):
        return db.session.query(DepartmentModel).order_by(DepartmentModel.name).all()

    def distinct_user_departments(self):
        """返回用户表中去重后的部门名称集合"""
        rows = (
            db.session.query(UserProfileModel.department)
            .filter(UserProfileModel.status == 1, UserProfileModel.department.isnot(None))
            .distinct()
            .all()
        )
        return {r[0] for r in rows if r[0]}

    def find_department_by_name(self, name: str):
        return db.session.query(DepartmentModel).filter_by(name=name).first()

    def find_department_by_id(self, dept_id: str):
        return db.session.query(DepartmentModel).filter_by(id=dept_id).first()

    def add_department(self, dept: DepartmentModel):
        db.session.add(dept)
        db.session.commit()

    def delete_department(self, dept: DepartmentModel):
        db.session.delete(dept)
        db.session.commit()

    # ── Hierarchy（上下级关系）──────────────────────────────────────────────

    def list_all_hierarchy(self):
        return db.session.query(HierarchyModel).all()

    def find_hierarchy_by_id(self, relation_id: str):
        return db.session.query(HierarchyModel).filter_by(id=relation_id).first()

    def find_subordinate_rels(self, supervisor_work_no: str):
        """查找某人作为上级的所有关系记录"""
        return db.session.query(HierarchyModel).filter(
            db.func.lower(HierarchyModel.supervisor_work_no) == (supervisor_work_no or "").lower()
        ).all()

    def find_supervisor_rels(self, subordinate_work_no: str):
        """查找某人作为下级的所有关系记录"""
        return db.session.query(HierarchyModel).filter(
            db.func.lower(HierarchyModel.subordinate_work_no) == (subordinate_work_no or "").lower()
        ).all()

    def is_supervisor(self, work_no: str) -> bool:
        """判断某人是否是主管（至少有一条下级记录）"""
        return db.session.query(HierarchyModel).filter(
            db.func.lower(HierarchyModel.supervisor_work_no) == (work_no or "").lower()
        ).first() is not None

    # ── Role ────────────────────────────────────────────────────────────────

    def find_user_role(self, work_no: str):
        """获取用户角色，返回 (UserRoleModel, RoleModel) 或 None"""
        return (
            db.session.query(UserRoleModel, RoleModel)
            .join(RoleModel, UserRoleModel.role_code == RoleModel.code)
            .filter(UserRoleModel.work_no == work_no)
            .first()
        )

    def find_user_role_record(self, work_no: str):
        return db.session.query(UserRoleModel).filter_by(work_no=work_no).first()

    def delete_role_by_work_no(self, work_no: str):
        db.session.query(UserRoleModel).filter(
            db.func.lower(UserRoleModel.work_no) == (work_no or "").lower()
        ).delete()
        db.session.commit()

    # ── Admin ───────────────────────────────────────────────────────────────

    def find_admin_by_username(self, username: str):
        return db.session.query(AdminUserModel).filter_by(username=username, status=1).first()
