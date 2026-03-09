# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""

from flask import request
from apps.project_app.models import OperProjectDataModel
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import ProjectDataModelSchema
from influxDB.influxdb_oper import oper_fluxdb


class DeleteProjectController:
    def __init__(self, project_id, user_id) -> None:
        self.opdm = OperProjectDataModel()
        self.pdms = ProjectDataModelSchema()
        self.project_id = project_id
        self.user_id = user_id

    def __write_data_to_influxdb(self, project_data):
        oper_fluxdb.add_record(
            self.user_id,
            "delete_project",
            "success",
            f"刪除名稱為{project_data.project_nm}({project_data.id})的專案",
            request.headers.get("X-Real-IP"),
        )

    def process_delete_project(self):
        project_data = self.opdm.search_data_by_id(self.project_id)
        if not project_data:
            return "project_id不存在", False
        result, flag = self.opdm.delete_data(self.project_id)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__write_data_to_influxdb(project_data)
        return result, flag
