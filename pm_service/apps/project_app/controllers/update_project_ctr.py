# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""

from flask import request
from apps.project_app.models import OperProjectDataModel, OperProjectGroupModel
from common.common_minio import OperMinio
from common.common_tools import get_now
from configs.constant import BUCKET
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import ProjectDataModelSchema
from common.oper_log import add_operation_record


class UpdateProjectController:
    def __init__(self, payload, user_id, files_dict, project_id) -> None:
        self.opdm = OperProjectDataModel()
        self.om = OperMinio()
        self.pdms = ProjectDataModelSchema()
        self.opgm = OperProjectGroupModel()
        self.payload = payload
        self.user_id = user_id
        self.files_dict = files_dict
        self.project_id = project_id

    def __define_parm(self, project_data):
        project_db = self.pdms.dump(project_data)
        self.project_db = project_db
        self.new_dpt = self.payload["department"]
        self.new_pn = self.payload["project_nm"]
        self.db_dpt = project_db["department"]
        self.db_pn = project_db["project_nm"]

    def __extract_upload_file(self):
        for file_type, file_val in self.files_dict.items():
            for file in file_val:
                file_name = file.filename
                file_data = file.stream.read()
                if not self.om.upload_stream_file(
                    BUCKET,
                    f'{self.project_db["department"]}/project/{self.project_db["project_nm"]}_{self.project_id}/{file_type}/{file_name}',
                    file_data,
                ):
                    return False
        return True

    def __assemble_project_info(self):
        project_info = self.payload.copy()
        if self.payload.get("developers"):
            project_info["developers"] = ";".join(self.payload["developers"])
        project_info["creator"] = self.user_id
        if not self.payload.get("product_pm"):
            project_info["product_pm"] = self.user_id
        return project_info

    def __handle_update_content(self, pro_data):
        if pro_data["project_nm"] != self.payload["project_nm"]:
            details = (
                f"將{pro_data['project_nm']}專案名称修改為{self.payload['project_nm']}"
            )
            self.__write_operation_log(details)
        if pro_data["priority"] != self.payload["priority"]:
            if self.payload["priority"] == 1:
                priority = "正常"
            elif self.payload["priority"] == 2:
                priority = "緊急"
            details = f"將{pro_data['project_nm']}專案優先級修改為{priority}"
            self.__write_operation_log(details)
        if pro_data["product_pm"] != self.payload["product_pm"]:
            details = (
                f"將{pro_data['project_nm']}專案PM修改為{self.payload['product_pm']}"
            )
            self.__write_operation_log(details)
        if pro_data["project_pm"] != self.payload["project_pm"]:
            details = f"將{pro_data['project_nm']}專案系統分析師修改為{self.payload['project_pm']}"
            self.__write_operation_log(details)

    def __write_operation_log(self, details):
        add_operation_record(
            self.user_id, "update_project", "success",
            details,
            ip=request.headers.get("X-Real-IP") or '',
            matter_id=self.project_id,
        )

    def process_update_project(self):
        project_data = self.opdm.search_data_by_id(self.project_id)
        pro_data = self.pdms.dump(project_data).copy()
        if not project_data:
            return "project_id不存在", False
        self.__define_parm(project_data)
        project_info = self.__assemble_project_info()
        project_info["updated_at"] = get_now()
        result, flag = self.opdm.update_data_by_id(self.project_id, project_info)
        result, flag = DBFunction.do_commit(result, flag)
        if flag is False:
            return result, flag
        flag = self.__extract_upload_file()
        if not flag:
            return "上傳檔案失敗", flag
        self.__handle_update_content(pro_data)
        return result, flag
