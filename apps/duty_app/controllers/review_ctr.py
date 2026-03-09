# -*- coding: utf-8 -*-
"""
@文件: review_ctr.py
@說明:
@時間: 2024/06/27 09:21:14
@作者: XuHeng
"""
from functools import cached_property

from apps.duty_app.models import (OperReviewRecordFormModel,
                                  OperTemporaryDutyApplyRecordModel,
                                  OperTemporaryDutyModel)
from common.common_tools import CommonTools, get_empid_department_info
from configs.const_conf import ENV, send_message_link
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import (ReviewRecordModelSchema,
                                       TemporaryDutyApplyRecordModelSchema)


class ApplyReviewController:
    def __init__(self) -> None:
        self.otdarm = OperTemporaryDutyApplyRecordModel()
        self.rrms = ReviewRecordModelSchema()
        self.orrfm = OperReviewRecordFormModel()
        self.otdm = OperTemporaryDutyModel()

    @cached_property
    def duty_apply_schema(self):
        _fields = [
            "id",
            "duty_id",
            "submitter",
            "apply_type",
            "created_at",
            "priority",
        ]
        return TemporaryDutyApplyRecordModelSchema(only=_fields)

    def get_reviewlist(self, payload, user_id):
        size = payload.get("size", 10)
        page = payload.get("page", 1)
        result = self.otdarm.search_data_by_user_id(user_id, page, size)
        record_list, total_count = result
        apply_list = list()
        for record in record_list:
            record_data = self.duty_apply_schema.dump(record[0])
            review_id = record_data.pop("id")
            record_data["review_id"] = review_id
            record_data["duty_nm"] = record.duty_nm
            apply_list.append(record_data)
            apply_list = sorted(apply_list, key=lambda x: x["priority"], reverse=True)
        return {
            "total_page": CommonTools.get_total_page(size, total_count),
            "total_count": total_count,
            "data_list": apply_list,
        }

    def __get_apply_record(self, review_id):
        data = self.otdarm.search_data_by_review_id(review_id)
        apply_record = TemporaryDutyApplyRecordModelSchema().dump(data)
        return apply_record

    def __get_all_review_result(self, review_id):
        datalist = self.orrfm.search_result_by_review_id(review_id)
        datalist = self.rrms.dump(datalist, many=True)
        return datalist

    def __get_result(self, result_list):
        result = 1
        for r in result_list:
            if int(r["result"]) != 1:
                result = int(r["result"])
                break
        return result

    def __get_apply_status(self, review_result):
        if review_result == 1:
            apply_status = 3
        else:
            apply_status = 0
        return apply_status

    def __get_duty_status(self, review_result, apply_type):
        duty_status = 0
        if apply_type == "創建任務":
            if review_result == 1:
                duty_status = 1
            else:
                duty_status = 3
        elif apply_type == "完結任務":
            if review_result == 1:
                duty_status = 3
            else:
                duty_status = 2
        return duty_status

    def __send_notice_when_duty_create_adopt(self, apply_record):
        apply_type = apply_record["apply_type"]
        duty_data = self.otdm.search_data_by_duty_id(apply_record["duty_id"])
        link = f"{send_message_link[ENV]}task/{apply_record['duty_id']}"
        responsible = (
            duty_data.responsible.split(";")
            if duty_data.responsible is not None
            else []
        )
        if apply_type == "創建任務":
            message = f"您好，您的任務({duty_data.duty_nm})的立案申請已通過申請，請按計劃進行開發，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, [duty_data.creator])
            if len(responsible) > 0:
                message = f"您好，臨時任務({duty_data.duty_nm})的立案申請已通過申請，請及時更新相關任務進度，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, responsible)
        elif apply_type == "完結任務":
            responsible = list(set(responsible + [duty_data.creator]))
            message = f"您好，({duty_data.duty_nm})的任務完結申請已通過申請，請查閱，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, responsible)

    def update_duty_review(self, payload, review_id, user_id):
        apply_record = self.__get_apply_record(review_id)
        if not apply_record:
            return "review_id 不存在", False
        reviewer_list = apply_record.get("reviewer", "").split(";")
        payload["apply_id"] = review_id
        payload["reviewer"] = user_id
        result_list = self.__get_all_review_result(review_id)
        result_list.append(payload)
        result = ""
        flag = True
        if len(result_list) == len(reviewer_list):
            review_result = self.__get_result(result_list)
            apply_status = self.__get_apply_status(review_result)
            apply_type = apply_record["apply_type"]
            duty_status = self.__get_duty_status(review_result, apply_type)
            if duty_status != 0:
                result, flag = self.otdm.update_status(duty_status, review_id)
            if flag:
                result, flag = self.otdarm.update_status(apply_status, review_id)
        if flag:
            obj = self.rrms.load(payload)
            result, flag = self.orrfm.add_data_to_db(obj)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            if len(result_list) == len(reviewer_list):
                self.__send_notice_when_duty_create_adopt(apply_record)
        return result, flag
