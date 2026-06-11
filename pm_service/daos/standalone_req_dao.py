# -*- coding: utf-8 -*-
"""
@文件: standalone_req_dao.py
@说明: 独立需求 DAO
"""
from dbs.mysql_db import db
from tables.standalone_req_table import StandaloneReqModel
from tables.user_table import UserProfileModel
from tables.system_table import SystemModel
from .base_dao import BaseDAO


class StandaloneReqDAO(BaseDAO):
    model = StandaloneReqModel

    def find_by_id(self, req_id: str):
        return db.session.query(StandaloneReqModel).filter_by(id=req_id).first()

    def list_active_query(self):
        """返回未删除需求的基础 query"""
        return db.session.query(StandaloneReqModel).filter(StandaloneReqModel.req_status != 9)

    def find_draft_by_ids(self, req_ids: list):
        """按 ID 列表查询草稿状态的需求"""
        return db.session.query(StandaloneReqModel).filter(
            StandaloneReqModel.id.in_(req_ids),
            StandaloneReqModel.req_status == 0,
        ).all()

    def name_map(self, work_nos: set) -> dict:
        """批量工号 → 姓名映射（大小写不敏感），返回 {work_no_lower: name}"""
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
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

    def system_name_map(self, sys_ids: set) -> dict:
        """批量系统ID → 名称映射"""
        if not sys_ids:
            return {}
        systems = db.session.query(SystemModel.id, SystemModel.sys_nm).filter(
            SystemModel.id.in_(sys_ids)
        ).all()
        return {s.id: s.sys_nm for s in systems}

    def find_system(self, system_id: str):
        return db.session.query(SystemModel).filter_by(id=system_id).first()

    def find_user(self, work_no: str):
        """按工号查找用户（大小写不敏感）"""
        return db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no) == (work_no or "").lower()
        ).first()
