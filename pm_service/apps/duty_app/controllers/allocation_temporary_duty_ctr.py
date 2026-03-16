# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
import time

from apps.duty_app.models import OperTemporaryDutyModel
from common.common_tools import CommonTools
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import TemporaryDutyModelSchema


class AllocationTemporaryDutyController:
    def __init__(self, payload) -> None:
        self.otdm = OperTemporaryDutyModel()
        self.tdms = TemporaryDutyModelSchema()
        self.payload = payload

    def __define_parm(self, temporary_duty_data):
        temporary_duty_db = self.tdms.dump(temporary_duty_data)
        self.temporary_duty_db = temporary_duty_db
        self.db_responsible = temporary_duty_db["responsible"]
        if self.db_responsible is None:
            self.db_responsible = ""

    def __define_date(self):
        exp_start_date = self.payload.get("expected_start_date")
        exp_end_date = self.payload.get("expected_end_date")
        if not exp_start_date and not exp_end_date:
            return False
        if (exp_start_date and not exp_end_date) or (
            not exp_start_date and exp_end_date
        ):
            return "開始日期與結束日期需同時存在"
        start = time.strptime(exp_start_date, "%Y-%m-%d")
        end = time.strptime(exp_end_date, "%Y-%m-%d")
        if start > end:
            return "結束日期不可早於開始日期"
        return False

    def __send_message_to_developers(self, duty_data, responsible, user_id):
        link = f"{send_message_link[ENV]}task/{duty_data['id']}"
        name = get_user_name(user_id)
        if duty_data["responsible"]:
            duty_responsible = duty_data["responsible"].split(";")
            if len(responsible) > len(duty_responsible):
                miss_responsible = [
                    res for res in responsible if res not in duty_responsible
                ]
                responsible = [res for res in responsible if res in duty_responsible]
                message = f"您好，{name}在({duty_data['duty_nm']})任務中新增開發者，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, responsible)
                message = f"您好，{name}在({duty_data['duty_nm']})給您分配了一項臨時任務，請及时处理，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, miss_responsible)
        else:
            message = f"您好，{name}在({duty_data['duty_nm']})給您分配了一項臨時任務，請及时处理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, responsible)

    def allocation_duty(self, user_id, duty_id):
        duty_data = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_data:
            return "temporary_duty_id不存在", False
        if duty_data.status not in [1, 2]:
            return "臨時任務處於審核或完結狀態，無法分配", False
        if user_id != duty_data.creator and duty_data.responsible.find(user_id) <= -1:
            return "無權限分配任務", False
        content = self.__define_date()
        if content:
            return content, False
        _end_date = duty_data.expected_end_date
        if _end_date and _end_date != self.payload.get("expected_end_date"):
            expected_end_date = self.payload.pop("expected_end_date")
            self.payload["latest_expected_end_date"] = expected_end_date
            revision_count = duty_data.revision_count
            if revision_count:
                revision_count += 1
            else:
                revision_count = 1
            self.payload["revision_count"] = revision_count
        duty_data = self.tdms.dump(duty_data)
        self.__define_parm(duty_data)
        self.payload["updated_at"] = CommonTools.get_now()
        responsible = self.payload.get("responsible", list())
        if responsible:
            self.payload["responsible"] = ";".join(responsible)
        result, flag = self.otdm.update_data_by_id(duty_id, self.payload)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__send_message_to_developers(duty_data, responsible, user_id)
        return result, flag
