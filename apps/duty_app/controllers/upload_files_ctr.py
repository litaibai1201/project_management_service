# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
from apps.duty_app.models import OperTemporaryDutyModel
from common.common_minio import OperMinio
from configs.constant import BUCKET
from serialize.model_serizlize import TemporaryDutyModelSchema


class UploadFilesController:
    def __init__(self, payload, files_dict):
        self.otdm = OperTemporaryDutyModel()
        self.om = OperMinio()
        self.tdms = TemporaryDutyModelSchema()
        self.payload = payload
        self.files_dict = files_dict

    def __extract_upload_file(self, file_path, file_list, file_type):
        for file in file_list:
            file_name = file.filename
            file_data = file.stream.read()
            if not self.om.upload_stream_file(
                BUCKET,
                f"{file_path}/{file_type}/{file_name}",
                file_data,
            ):
                return False

    def __assemble_duty_info(self, duty_info):
        for file_type, file_list in self.files_dict.items():
            duty_io = self.__extract_upload_file(
                duty_info["path"], file_list, file_type
            )
            if duty_io is False:
                return False
        return True

    def process_upload_files(self, user_id, duty_id):
        duty_data = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_data:
            return "temporary_duty_id不存在", False
        if duty_data.status not in [1, 2]:
            return "臨時任務處於審核或完結狀態，無法上傳", False
        if user_id != duty_data.creator:
            return "你不是任务创建者，无法上传文件", False
        duty_data = self.tdms.dump(duty_data)
        flag = self.__assemble_duty_info(duty_data)
        if not flag:
            return "上傳檔案失敗", flag
        return "上傳檔案成功", flag
