import math
from functools import cached_property

from apps.user_app.models import (
    OperReviewRecordModel,
    OperTemporaryDutyApplyRecordModel,
)
from serialize.model_serizlize import ReviewRecordModelSchema


class DutyMyApplyController:
    def __init__(self, payload, user_id) -> None:
        self.status = payload.get("status")
        self.page = payload.get("page", 1)
        self.size = payload.get("size", 10)
        self.user_id = user_id
        self.data_list = []
        self.otdarm = OperTemporaryDutyApplyRecordModel()
        self.orrm = OperReviewRecordModel()

    def __make_data_list(self, apply_db, result_list):
        for sear_db in apply_db:
            self.data_list.append(
                {
                    "duty_nm": sear_db[1],
                    "duty_id": sear_db[2],
                    "apply_type": sear_db[0].apply_type,
                    "apply_id": sear_db[0].id,
                    "status": sear_db[0].status,
                    "reviewer": sear_db[0].reviewer.split(";"),
                    "result_list": result_list.get(sear_db[0].id, []),
                    "created_at": sear_db[0].created_at,
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

    def __get_my_apply_duty_list(self):
        apply_db, total = self.otdarm.search_duty_apply_by_user_id(
            self.user_id, self.status, self.page, self.size
        )
        if total == 0:
            return total
        apply_id_list = []
        for sear_db in apply_db:
            apply_id_list.append(sear_db[0].id)
        result_list = self.__get_result_list(apply_id_list)
        self.__make_data_list(apply_db, result_list)
        return total

    def get_my_apply_duty(self):
        total = self.__get_my_apply_duty_list()
        return {
            "total_page": math.ceil(total / self.size),
            "total_count": total,
            "data_list": self.data_list,
        }
