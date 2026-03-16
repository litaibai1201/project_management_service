# -*- coding: utf-8 -*-
"""
@文件: models.py
@說明:
@時間: 2024/03/06 16:01:34
@作者: LiDong
"""


from sqlalchemy import func, or_

from dbs.mysql_db import db
from dbs.mysql_db.model_tables import ProjectDataModel, TemporaryDutyModel


class OperSearchDataModel:

    def __add_filter_data(self, session_data, model, payload):
        department = payload.get("department", "")
        if department:
            session_data = session_data.filter(model.department == department)
        is_finished = payload.get("is_finished", "")
        if is_finished == "Y":
            session_data = session_data.filter(model.status == 7)
        elif is_finished == "N":
            session_data = session_data.filter(
                or_(
                    model.status == 1,
                    model.status == 2,
                    model.status == 3,
                    model.status == 4,
                    model.status == 5,
                    model.status == 6,
                )
            )
        else:
            session_data = session_data.filter(model.status != 0)
        start_date = payload.get("start_date", "")
        if start_date:
            session_data = session_data.filter(
                func.str_to_date(model.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d")
            )
        end_date = payload.get("end_data", "")
        if end_date:
            session_data = session_data.filter(
                func.str_to_date(model.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d")
            )
        return session_data

    def __search_data(self, model, query, payload, page, size):
        query = self.__add_filter_data(query, model, payload)
        datalist = query.slice((page - 1) * size, page * size).all()
        total_count = query.count()
        return datalist, total_count

    def search_project(self, payload, page, size):
        query = db.session.query(ProjectDataModel)
        keyword = payload.get("keyword", "")
        if keyword:
            query = query.filter(
                or_(
                    ProjectDataModel.project_nm.contains(keyword),
                    ProjectDataModel.describe.contains(keyword),
                )
            )
        return self.__search_data(ProjectDataModel, query, payload, page, size)

    def search_duty(self, payload, page, size):
        query = db.session.query(TemporaryDutyModel)
        keyword = payload.get("keyword", "")
        if keyword:
            query = query.filter(
                or_(
                    TemporaryDutyModel.duty_nm.contains(keyword),
                    TemporaryDutyModel.describe.contains(keyword),
                )
            )
        return self.__search_data(TemporaryDutyModel, query, payload, page, size)
