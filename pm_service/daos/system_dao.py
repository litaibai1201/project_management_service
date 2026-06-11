# -*- coding: utf-8 -*-
"""
@文件: system_dao.py
@说明: 系统管理 DAO
"""
from dbs.mysql_db import db
from tables.system_table import SystemModel
from tables.user_table import UserProfileModel
from .base_dao import BaseDAO


class SystemDAO(BaseDAO):
    model = SystemModel

    def query_active(self, keyword: str = "", sys_group: str = ""):
        q = db.session.query(SystemModel).filter(SystemModel.sys_status != 9)
        if keyword:
            q = q.filter(SystemModel.sys_nm.like(f"%{keyword}%"))
        if sys_group:
            q = q.filter(SystemModel.sys_group == sys_group)
        return q.order_by(SystemModel.sys_nm.asc())

    def find_active_by_id(self, system_id: str):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if s and s.sys_status == 9:
            return None
        return s

    def list_groups(self):
        rows = db.session.query(SystemModel.sys_group).filter(
            SystemModel.sys_status != 9,
            SystemModel.sys_group.isnot(None),
            SystemModel.sys_group != "",
        ).distinct().all()
        return [r[0] for r in rows]

    def name_map(self, work_nos: set) -> dict:
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u.name for u in users}
