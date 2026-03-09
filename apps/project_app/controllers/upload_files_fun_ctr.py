# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""

from apps.project_app.controllers.function_ctr import FunctionUpdateController
from apps.project_app.models import OperFunctionDataModel
from serialize.model_serizlize import FunctionDataModelSchema


class UploadFilesFunctionController(FunctionUpdateController):
    def __init__(self) -> None:
        super().__init__()
        self.ofdm = OperFunctionDataModel()
        self.FunctionSchema = FunctionDataModelSchema()

    def upload_function_files(self, empid, pid, fid, fdict):
        data = self.ofdm.search_fun_data_by_fid(pid, fid)
        if not data:
            return f"{pid} or {fid} 不存在！", False
        if not self.is_deletable(empid, pid):
            return "無更新權限", False
        data = self.FunctionSchema.dump(data)
        file_path = data.get("path", "")
        if not file_path:
            return "路徑不存在", False
        minio_flag = self.extract_upload_file(fdict, file_path)
        if not minio_flag:
            return "文件上傳失敗", minio_flag
        return "文件上傳成功", minio_flag
