# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""

from apps.duty_app.models import OperTemporaryDutyModel
from common.common_minio import OperMinio
from common.common_tools import CommonTools
from configs.constant import BUCKET
from serialize.model_serizlize import TemporaryDutyModelSchema


class SearchTemporaryDutyFilesController:
    def __init__(self) -> None:
        self.otdm = OperTemporaryDutyModel()
        self.minio = OperMinio()

    def __delete_record_file(self, file_list):
        result = list()
        for file in file_list:
            if "/record/" not in file["file_url"]:
                result.append(file)
        return result

    def __get_minio_file_path(self, file_path):
        data_dict = dict()
        file_info, flag = self.minio.get_all_files_info_by_path(
            BUCKET, file_path
        )
        if not flag:
            return data_dict
        file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
        files = file_info_dic.get("files", [])
        data_dict["files"] = self.__delete_record_file(files)
        images = file_info_dic.get("images", [])
        data_dict["images"] = self.__delete_record_file(images)
        videos = file_info_dic.get("videos", [])
        data_dict["videos"] = self.__delete_record_file(videos)
        return data_dict

    def get_temporary_duty_files(self, duty_id):
        duty_data = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_data:
            return "temporary_duty_id不存在", False
        duty_data = TemporaryDutyModelSchema().dump(duty_data)
        file_path = duty_data["path"]
        if not file_path:
            return dict(), True
        data_dict = self.__get_minio_file_path(file_path)
        return data_dict, True
