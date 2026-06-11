# -*- coding: utf-8 -*-
"""
@文件: dashboard_config_dao.py
@说明: 仪表盘配置 DAO
"""
from dbs.mysql_db import db
from tables.dashboard_table import UserDashboardConfigModel
from .base_dao import BaseDAO


class DashboardConfigDAO(BaseDAO):
    model = UserDashboardConfigModel

    def list_by_user(self, work_no: str, view_type: str):
        return (db.session.query(UserDashboardConfigModel)
                .filter(db.func.lower(UserDashboardConfigModel.work_no) == (work_no or "").lower(),
                        UserDashboardConfigModel.view_type == view_type)
                .all())

    def find_one(self, work_no: str, view_type: str, widget_id: str):
        return (db.session.query(UserDashboardConfigModel)
                .filter(db.func.lower(UserDashboardConfigModel.work_no) == (work_no or "").lower(),
                        UserDashboardConfigModel.view_type == view_type,
                        UserDashboardConfigModel.widget_id == widget_id)
                .first())
