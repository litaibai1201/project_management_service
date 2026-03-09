# -*- coding: utf-8 -*-
"""
@文件: search_ctr.py
@說明:
@時間: 2024/07/26 15:49:57
@作者: LiDong
"""

from functools import cached_property

from apps.search_app.models import OperSearchDataModel
from common.common_minio import OperMinio
from common.common_tools import CommonTools
from configs.constant import BUCKET
from serialize.model_serizlize import (ProjectDataModelSchema,
                                       TemporaryDutyModelSchema)


class SearchController:
    def __init__(self) -> None:
        self.osdm = OperSearchDataModel()

    @cached_property
    def pro_schema(self):
        dump_fields = [
            "id",
            "project_nm",
            "describe",
            "priority",
            "creator",
            "department",
            "created_at",
        ]
        return ProjectDataModelSchema(many=True, only=dump_fields)

    @cached_property
    def duty_schema(self):
        dump_fields = [
            "id",
            "duty_nm",
            "describe",
            "priority",
            "creator",
            "department",
            "created_at",
        ]
        return TemporaryDutyModelSchema(many=True, only=dump_fields)

    def __format_project(self, datalist):
        datalist = self.pro_schema.dump(datalist)
        for data in datalist:
            name = data.pop("project_nm")
            data["name"] = name
            data["type"] = "專案"
        return datalist

    def __format_duty(self, datalist):
        datalist = self.duty_schema.dump(datalist)
        for data in datalist:
            name = data.pop("duty_nm")
            data["name"] = name
            data["type"] = "臨時任務"
        return datalist

    def __search_type_get_data(self, payload):
        _type = payload.get("type", "專案")
        page = payload.get("page", 1)
        size = payload.get("size", 10)
        result_list = list()
        result_count = 0
        if _type == "專案":
            pro_list, result_count = self.osdm.search_project(payload, page, size)
            result_list = self.__format_project(pro_list)
        elif _type == "臨時任務":
            duty_list, result_count = self.osdm.search_duty(payload, page, size)
            result_list = self.__format_duty(duty_list)

        return result_list, result_count

    def process_search(self, payload):
        datalist, total_count = self.__search_type_get_data(payload)
        size = payload.get("size", 10)
        return {
            "total_page": CommonTools.get_total_page(size, total_count),
            "total_count": total_count,
            "data_list": datalist,
        }


class PathsController:
    def __init__(self) -> None:
        self.minio = OperMinio()

    def __get_img_urls(self, _path):
        file_info, flag = self.minio.get_all_files_info_by_path(BUCKET, _path)
        if not flag:
            return {}
        file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
        return file_info_dic

    def run(self, payload):
        urls = list()
        _paths = payload.get("_paths", list())
        for _path in _paths:
            file_info_dic = self.__get_img_urls(_path)
            for _, file_info in file_info_dic.items():
                urls += file_info
        return urls
