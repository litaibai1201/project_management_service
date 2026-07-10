# -*- coding: utf-8 -*-
"""
@文件: requirement_dao.py
@说明: 专案需求 DAO
"""
from dbs.mysql_db import db
from tables.requirement_table import RequirementModel
from tables.project_table import ProjectDataModel
from tables.user_table import UserProfileModel
from .base_dao import BaseDAO


class RequirementDAO(BaseDAO):
    model = RequirementModel

    def find_by_id(self, req_id: str):
        return db.session.query(RequirementModel).filter_by(id=req_id).first()

    def list_by_project(self, project_id: str):
        """获取专案下所有未删除的需求（按创建时间倒序）"""
        return (
            db.session.query(RequirementModel)
            .filter_by(project_id=project_id)
            .filter(RequirementModel.req_status != 9)
            .order_by(RequirementModel.created_at.desc())
            .all()
        )

    def list_active_query(self):
        """返回未删除需求的基础 query"""
        return db.session.query(RequirementModel).filter(RequirementModel.req_status != 9)

    def find_by_ids(self, req_ids: list):
        """批量按 ID 查询，返回 {id: model} 映射"""
        if not req_ids:
            return {}
        rows = db.session.query(RequirementModel).filter(
            RequirementModel.id.in_(req_ids)
        ).all()
        return {r.id: r for r in rows}

    def find_project(self, project_id: str):
        return db.session.query(ProjectDataModel).filter_by(id=project_id).first()

    def project_name_map(self, project_ids: set) -> dict:
        """批量专案ID → 名称映射"""
        if not project_ids:
            return {}
        projects = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id.in_(project_ids)
        ).all()
        return {p.id: p.project_nm for p in projects}

    def creator_name_map(self, work_nos: set) -> dict:
        """批量工号 → 姓名映射（大小写不敏感）"""
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u.name for u in users}

    def find_creator_user(self, work_no: str):
        """按工号查找用户（大小写不敏感）"""
        return db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no) == (work_no or "").lower()
        ).first()
