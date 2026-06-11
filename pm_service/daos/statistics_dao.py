# -*- coding: utf-8 -*-
"""
@文件: statistics_dao.py
@说明: 统计模块 DAO — 封装成员/任务批量查询
"""
from dbs.mysql_db import db
from tables.user_table import UserProfileModel
from tables.function_table import FunctionDataModel
from tables.duty_table import TemporaryDutyModel
from .base_dao import BaseDAO


class StatisticsDAO(BaseDAO):
    model = UserProfileModel

    # ── 下属用户列表 ──────────────────────────────────────────────────

    def get_subordinate_users(self, work_no: str, all_levels: bool = True):
        """
        获取下属的 UserProfileModel 列表。
        优先查层级关系，若无下属则回退查所有活跃成员（排除自身）。
        返回 (users, sub_work_nos)：users 是 UserProfileModel 列表，
        sub_work_nos 是原始下属工号列表（空列表表示无层级关系，走了回退逻辑）。
        """
        from controllers.user_controller import UserController
        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=all_levels)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if sub_work_nos:
            users = (
                db.session.query(UserProfileModel)
                .filter(
                    db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in sub_work_nos]),
                    UserProfileModel.status == 1,
                )
                .all()
            )
        else:
            users = (
                db.session.query(UserProfileModel)
                .filter(UserProfileModel.status == 1, UserProfileModel.work_no != work_no)
                .all()
            )
        return users, sub_work_nos

    def get_subordinate_user_columns(self, work_no: str, columns=None, all_levels: bool = True):
        """
        与 get_subordinate_users 类似，但只查询指定列（默认 work_no, name）。
        返回 (rows, sub_work_nos)。
        """
        if columns is None:
            columns = (UserProfileModel.work_no, UserProfileModel.name)

        from controllers.user_controller import UserController
        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=all_levels)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if sub_work_nos:
            rows = (
                db.session.query(*columns)
                .filter(
                    db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in sub_work_nos]),
                    UserProfileModel.status == 1,
                )
                .all()
            )
        else:
            rows = (
                db.session.query(*columns)
                .filter(UserProfileModel.status == 1, UserProfileModel.work_no != work_no)
                .all()
            )
        return rows, sub_work_nos

    # ── 批量查询功能任务 ──────────────────────────────────────────────

    def batch_query_functions_by_responsible(self, work_nos_lower: list):
        """
        批量查询负责人在 work_nos_lower 中的活跃功能任务。
        返回 FunctionDataModel 列表。
        """
        if not work_nos_lower:
            return []
        func_conds = [
            db.func.lower(FunctionDataModel.responsible).like(f'%"{wn}"%')
            for wn in work_nos_lower
        ]
        return db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
            db.or_(*func_conds),
        ).all()

    # ── 批量查询 AR 任务 ──────────────────────────────────────────────

    def batch_query_duties_by_responsible(self, work_nos_lower: list, exclude_deleted: bool = False):
        """
        批量查询负责人在 work_nos_lower 中的活跃 AR 任务。
        返回 TemporaryDutyModel 列表。
        """
        if not work_nos_lower:
            return []
        duty_conds = [
            db.func.lower(TemporaryDutyModel.responsible).like(f'%"{wn}"%')
            for wn in work_nos_lower
        ]
        q = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.status == 1,
            db.or_(*duty_conds),
        )
        if exclude_deleted:
            q = q.filter(TemporaryDutyModel.duty_status != 9)
        return q.all()

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
