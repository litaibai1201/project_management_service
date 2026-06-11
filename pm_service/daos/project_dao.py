# -*- coding: utf-8 -*-
"""
@文件: project_dao.py
@说明: 项目管理 DAO — 封装项目/功能/审核/里程碑的常用查询
"""
from dbs.mysql_db import db
from tables.project_table import ProjectDataModel, ProjectGroupModel, ProjectFileModel
from tables.function_table import FunctionDataModel
from tables.review_table import ReviewApplyModel
from tables.milestone_table import MilestoneModel
from tables.user_table import UserProfileModel
from .base_dao import BaseDAO


class ProjectDAO(BaseDAO):
    model = ProjectDataModel

    # ── Project 查询 ──────────────────────────────────────────────────

    def find_project_by_id(self, project_id: str):
        """按 ID 查询项目（含已删除）"""
        return db.session.query(ProjectDataModel).filter_by(id=project_id).first()

    def find_active_project(self, project_id: str):
        """按 ID 查询未删除的项目，status=9 视为已删除返回 None"""
        p = self.find_project_by_id(project_id)
        if p and p.project_status == 9:
            return None
        return p

    def assert_project_not_in_review(self, project_id: str):
        """完結審核中（status=6）不允许修改"""
        from utils.exceptions import PermissionException
        p = self.find_project_by_id(project_id)
        if p and p.project_status == 6:
            raise PermissionException(msg="专案正处于完结审核中，暂不允许任何修改操作")

    # ── Function 查询 ─────────────────────────────────────────────────

    def find_function_by_id(self, function_id: str):
        return db.session.query(FunctionDataModel).filter_by(id=function_id).first()

    def find_active_function(self, function_id: str):
        f = self.find_function_by_id(function_id)
        if f and f.function_status == 9:
            return None
        return f

    # ── Review 查询 ───────────────────────────────────────────────────

    def find_review_by_id(self, review_id: str):
        return db.session.query(ReviewApplyModel).filter_by(id=review_id).first()

    # ── Milestone 查询 ────────────────────────────────────────────────

    def find_milestone_by_id(self, milestone_id: str):
        return db.session.query(MilestoneModel).filter_by(id=milestone_id).first()

    # ── 用户名称映射 ──────────────────────────────────────────────────

    def name_map(self, work_nos) -> dict:
        """批量查询工号→姓名映射（大小写不敏感）"""
        if not work_nos:
            return {}
        work_nos_lower = [w.lower() for w in work_nos]
        users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
            db.func.lower(UserProfileModel.work_no).in_(work_nos_lower)
        ).all()
        return {u.work_no.lower(): u.name for u in users}
