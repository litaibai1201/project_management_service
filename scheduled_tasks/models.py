import sys

from sqlalchemy import func, or_

sys.path.append("..")
from dbs.mysql_db.model_tables import (
    FunctionDataModel,
    ProjectDataModel,
    TemporaryDutyModel,
)
from dbs.mysql_db import db


class OperProjectDataModel:
    def search_pro_data(self):
        pro_data = (
            db.session.query(ProjectDataModel.id, ProjectDataModel.project_nm)
            .filter(ProjectDataModel.status == 5)
            .all()
        )
        return pro_data

    def get_pro_data(self):
        pro_data = (
            db.session.query(
                ProjectDataModel.id,
                ProjectDataModel.project_nm,
                ProjectDataModel.status,
            )
            .filter(ProjectDataModel.status == 5)
            .all()
        )
        return pro_data

    def get_complete_pro_data(self, date, before_date):
        pro_data = (
            db.session.query(
                ProjectDataModel.project_nm,
            )
            .filter(
                ProjectDataModel.status == 7,
                func.str_to_date(ProjectDataModel.status_update_at, "%Y-%m-%d")
                > func.str_to_date(before_date, "%Y-%m-%d"),
                func.str_to_date(ProjectDataModel.status_update_at, "%Y-%m-%d")
                <= func.str_to_date(date, "%Y-%m-%d"),
            )
            .all()
        )
        return pro_data


class OperFunctionDataModel:
    def search_fun_data(self, pid_list):
        fun_data = (
            db.session.query(
                FunctionDataModel.function_nm,
                FunctionDataModel.developers,
                FunctionDataModel.project_id,
            )
            .filter(
                FunctionDataModel.progress != 100,
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id.in_(pid_list),
            )
            .all()
        )
        return fun_data

    def get_daily_fun_data(self, pid, date):
        fun_data = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id == pid,
                FunctionDataModel.updated_at.contains(date),
            )
            .all()
        )
        return fun_data

    def get_next_week_fun_data(self, pid, date, after_week_date):
        fun_data = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id == pid,
                FunctionDataModel.progress != 100,
                func.str_to_date(FunctionDataModel.expected_end_date, "%Y-%m-%d")
                > func.str_to_date(date, "%Y-%m-%d"),
                func.str_to_date(FunctionDataModel.expected_end_date, "%Y-%m-%d")
                <= func.str_to_date(after_week_date, "%Y-%m-%d"),
            )
            .all()
        )
        return fun_data

    def get_week_fun_data(self, pid, date, before_date):
        fun_data = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id == pid,
                func.str_to_date(FunctionDataModel.updated_at, "%Y-%m-%d")
                > func.str_to_date(before_date, "%Y-%m-%d"),
                func.str_to_date(FunctionDataModel.updated_at, "%Y-%m-%d")
                <= func.str_to_date(date, "%Y-%m-%d"),
            )
            .all()
        )
        return fun_data


class OperTemporaryDutyModel:
    def search_duty_data(self):
        duty_data = (
            db.session.query(
                TemporaryDutyModel.responsible,
                TemporaryDutyModel.id,
                TemporaryDutyModel.duty_nm,
            )
            .filter(
                TemporaryDutyModel.progress != 100,
                TemporaryDutyModel.status.in_([1, 2]),
            )
            .all()
        )
        return duty_data
