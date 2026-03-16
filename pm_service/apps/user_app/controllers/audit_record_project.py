# -*- coding: utf-8 -*-
'''
@文件: audit_record_project.py
@說明:
@時間: 2025/01/07 10:09:37
@作者: LiDong
'''


import math
from functools import cached_property

from apps.user_app.models import OperFunctionDataModel, OperReviewRecordModel
from serialize.model_serizlize import (ProjectApplyRecordModelSchema,
                                       ReviewRecordModelSchema)


class ProjectAuditRecordController:
    def __init__(self, user_id, payload) -> None:
        self.user_id = user_id
        self.page = payload.get("page", 1)
        self.size = payload.get("size", 10)
        self.data_list = []
        self.orrm = OperReviewRecordModel()

    def __make_data_list(self, review_apply_db, fun_dict):
        for review, apply, pro_nm in review_apply_db:
            review_data = self.review_schema.dump(review)
            apply_data = self.apply_schema.dump(apply)
            self.data_list.append(
                {
                    "project_nm": pro_nm,
                    "function_nm": fun_dict.get(apply.function_id, ""),
                    "apply_id": apply.id,
                    **review_data,
                    **apply_data,
                }
            )

    @cached_property
    def review_schema(self):
        dump_fields = ["result", "remark"]
        return ReviewRecordModelSchema(only=dump_fields)

    @cached_property
    def apply_schema(self):
        dump_fields = [
            "submitter", "apply_type", "created_at", "project_id",
            "function_id"
        ]
        return ProjectApplyRecordModelSchema(only=dump_fields)

    def __get_audit_record_project(self):
        review_apply_db, total = self.orrm.search_pro_review_apply_by_userid(
            self.user_id, self.page, self.size
        )
        if not review_apply_db:
            return total
        ofdm = OperFunctionDataModel()
        fun_id_list = []
        for _, apply, _ in review_apply_db:
            if apply.function_id:
                fun_id_list.append(apply.function_id)
        fun_dict = {}
        if fun_id_list:
            fin_data = ofdm.search_nm_by_fid_list(fun_id_list)
            fun_dict = dict(fin_data)
        self.__make_data_list(review_apply_db, fun_dict)
        return total

    def audit_record_project(self):
        total = self.__get_audit_record_project()
        return {
            "total_page": math.ceil(total / self.size),
            "total_count": total,
            "data_list": self.data_list,
        }
