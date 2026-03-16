# -*- coding: utf-8 -*-
"""
@文件: my_apply_project_ctr.py
@說明: my_apply_project_ctr
@時間: 2024/07/27 14:26:31
@作者: ChenChiauShin
"""


import math
from functools import cached_property

from apps.user_app.models import (
    OperFunctionDataModel,
    OperProjectApplyRecordModel,
    OperReviewRecordModel,
)
from serialize.model_serizlize import ReviewRecordModelSchema


class ProjectMyApplyController:
    def __init__(self, payload, user_id) -> None:
        self.status = payload.get("status")
        self.page = payload.get("page", 1)
        self.size = payload.get("size", 10)
        self.user_id = user_id
        self.data_list = []
        self.oparm = OperProjectApplyRecordModel()
        self.orrm = OperReviewRecordModel()
        self.ofdm = OperFunctionDataModel()

    def __make_data_list(self, apply_db, result_list, fun_dict):
        for sear_db in apply_db:
            self.data_list.append(
                {
                    "project_nm": sear_db[5],
                    "project_id": sear_db[6],
                    "function_nm": fun_dict.get(sear_db[1], ""),
                    "function_id": sear_db[1],
                    "apply_type": sear_db[2],
                    "apply_id": sear_db[0],
                    "reviewer": sear_db[3].split(";"),
                    "status": sear_db[7],
                    "result_list": result_list.get(sear_db[0], []),
                    "created_at": sear_db[4],
                }
            )

    @cached_property
    def review_schema(self):
        dump_fields = ["apply_id", "reviewer", "result", "remark", "created_at"]
        return ReviewRecordModelSchema(only=dump_fields, many=True)

    def __get_result_list(self, apply_id_list):
        review_db = self.orrm.search_review_by_idlist(apply_id_list)
        review_data = self.review_schema.dump(review_db)
        total_result_list = {}
        for review in review_data:
            apply_id = review.pop("apply_id")
            if total_result_list.get(apply_id):
                total_result_list[apply_id].append(review)
            else:
                total_result_list[apply_id] = [review]
        return total_result_list

    def __get_fun_dict(self, func_id_list):
        fun_dict = dict()
        if func_id_list:
            fun_data = self.ofdm.search_nm_by_fid_list(func_id_list)
            fun_dict = dict(fun_data)
        return fun_dict

    def __get_my_apply_project_list(self):
        apply_db, total = self.oparm.search_pro_apply_by_user_id(
            self.user_id, self.status, self.page, self.size
        )
        if total == 0:
            return total
        func_id_list = list()
        apply_id_list = list()
        for sear_db in apply_db:
            apply_id_list.append(sear_db[0])
            fun_id = sear_db[1]
            if fun_id:
                func_id_list.append(fun_id)
        result_list = self.__get_result_list(apply_id_list)
        fun_dict = self.__get_fun_dict(func_id_list)
        self.__make_data_list(apply_db, result_list, fun_dict)
        return total

    def get_my_apply_project(self):
        total = self.__get_my_apply_project_list()
        total_page = math.ceil(total / self.size)
        return {
            "total_page": total_page,
            "total_count": total,
            "data_list": self.data_list,
        }
