# -*- coding: utf-8 -*-
'''
@文件: audit_record_duty.py
@說明:
@時間: 2025/01/07 10:09:47
@作者: LiDong
'''


import math
from functools import cached_property

from apps.user_app.models import OperReviewRecordModel, OperTempDutyModel
from serialize.model_serizlize import (ReviewRecordModelSchema,
                                       TemporaryDutyApplyRecordModelSchema)


class DutyAuditRecordController:
    def __init__(self, user_id, payload) -> None:
        self.user_id = user_id
        self.page = payload.get("page", 1)
        self.size = payload.get("size", 10)
        self.data_list = []
        self.orrm = OperReviewRecordModel()

    def __make_data_list(self, review_apply_db):
        for review, apply, duty_nm in review_apply_db:
            review_data = self.review_schema.dump(review)
            apply_data = self.apply_schema.dump(apply)
            self.data_list.append(
                {
                    "duty_nm": duty_nm,
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
        dump_fields = ["duty_id", "submitter", "apply_type", "created_at"]
        return TemporaryDutyApplyRecordModelSchema(only=dump_fields)

    def __get_audit_record_duty(self):
        review_apply_db, total = self.orrm.search_duty_review_apply_by_userid(
            self.user_id, self.page, self.size
        )
        if total == 0:
            return total
        self.otdm = OperTempDutyModel()
        self.__make_data_list(review_apply_db)
        return total

    def audit_record_duty(self):
        total = self.__get_audit_record_duty()
        return {
            "total_page": math.ceil(total / self.size),
            "total_count": total,
            "data_list": self.data_list,
        }
