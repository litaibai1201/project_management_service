# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
from apps.project_app.models import OperProjectDataModel
from common.common_minio import OperMinio
from common.common_tools import get_now
from configs.constant import BUCKET
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import ProjectDataModelSchema


class UploadFilesController:
    def __init__(self, payload, project_id, files_dict) -> None:
        self.opdm = OperProjectDataModel()
        self.om = OperMinio()
        self.pdms = ProjectDataModelSchema()
        self.payload = payload
        self.project_id = project_id
        self.files_dict = files_dict

    def __extract_upload_file(self):
        for file_type, file_val in self.files_dict.items():
            for file in file_val:
                file_name = file.filename
                file_data = file.stream.read()
                if not self.om.upload_stream_file(
                    BUCKET,
                    f"{self.project_db['path']}/{file_type}/{file_name}",
                    file_data,
                ):
                    return False
        return True

    def process_upload_files(self):
        project_data = self.opdm.search_data_by_id(self.project_id)
        if not project_data:
            return "project_id不存在", False
        self.project_db = self.pdms.dump(project_data)
        flag = self.__extract_upload_file()
        if not flag:
            return "上傳檔案失敗", flag
        code_url = self.payload.get("framework_code", None)
        if code_url:
            self.payload.pop("framework_code")
            self.payload["code_url"] = code_url
            self.payload["updated_at"] = get_now()
            result, flag = self.opdm.update_data_by_id(self.project_id, self.payload)
            result, flag = DBFunction.do_commit(result, flag)
            if not flag:
                return result, flag
        return "文件上傳成功", True
