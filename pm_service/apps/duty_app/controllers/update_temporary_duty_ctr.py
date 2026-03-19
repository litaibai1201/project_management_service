# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
import time

from flask import request

from apps.duty_app.models import OperTemporaryDutyModel
from common.common_minio import OperMinio
from common.common_tools import get_now
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from common.oper_log import add_operation_record
from serialize.model_serizlize import TemporaryDutyModelSchema


class UpdateTemporaryDutyController:
    def __init__(self, payload, user_id, files_dict):
        self.otdm = OperTemporaryDutyModel()
        self.tdms = TemporaryDutyModelSchema()
        self.om = OperMinio()
        self.payload = payload
        self.user_id = user_id
        self.files_dict = files_dict

    def __define_date(self):
        exp_start_date = self.payload.get("expected_start_date")
        exp_end_date = self.payload.get("expected_end_date")
        if not exp_start_date and not exp_end_date:
            return ""
        if (exp_start_date and not exp_end_date) or (
            not exp_start_date and exp_end_date
        ):
            return "開始日期與結束日期需同時存在"
        start = time.strptime(exp_start_date, "%Y-%m-%d")
        end = time.strptime(exp_end_date, "%Y-%m-%d")
        if start > end:
            return "結束日期不可早於開始日期"
        return ""

    def __format_update_data(self, duty_info):
        data = self.tdms.dump(self.payload)
        data["updated_at"] = get_now()
        responsible = self.payload.get("responsible", [])
        if responsible:
            data["responsible"] = ";".join(responsible)
        _end_date = duty_info.get("expected_end_date")
        if data.get("expected_end_date") and _end_date and _end_date != data.get("expected_end_date"):
            expected_end_date = data.pop("expected_end_date")
            data["latest_expected_end_date"] = expected_end_date
            revision_count = duty_info.get("revision_count")
            if revision_count:
                revision_count += 1
            else:
                revision_count = 1
            data["revision_count"] = revision_count
        return data

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

    def __send_message_to_developers(self, duty_info):
        link = f"{send_message_link[ENV]}task/{duty_info['id']}"
        name = get_user_name(self.user_id)
        responsible = self.payload.get("responsible", [])
        if duty_info["responsible"]:
            duty_responsible = duty_info["responsible"].split(";")
            if len(responsible) > len(duty_responsible):
                miss_responsible = [
                    res for res in responsible if res not in duty_responsible
                ]
                responsible = [res for res in responsible if res in duty_responsible]
                message = f"您好，{name}在({duty_info['duty_nm']})任務中新增開發者，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, responsible)
                message = f"您好，{name}在({duty_info['duty_nm']})給您分配了一項臨時任務，請及时处理，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, miss_responsible)
        else:
            message = f"您好，{name}在({duty_info['duty_nm']})給您分配了一項臨時任務，請及时处理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, responsible)

    def __handle_update_content(self, duty_info):
        duty_data = duty_info.copy()
        if duty_data["duty_nm"] != self.payload["duty_nm"]:
            details = (
                f"將{duty_data['duty_nm']}臨時任務名称修改為{self.payload['duty_nm']}"
            )
            self.__write_operation_log(details)
        if duty_data["priority"] != self.payload["priority"]:
            if self.payload["priority"] == 1:
                priority = "正常"
            elif self.payload["priority"] == 2:
                priority = "緊急"
            details = f"將{duty_data['duty_nm']}臨時任務優先級修改為{priority}"
            self.__write_operation_log(details)

    def __write_operation_log(self, details):
        add_operation_record(
            self.user_id, "update_duty_task", "success",
            details,
            ip=request.headers.get("X-Real-IP") or '',
            matter_id=duty_id,
        )

    def update_temporary_duty(self, duty_id):
        duty_info = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_info:
            return "temporary_duty_id不存在", False
        if duty_info.status not in [1, 2]:
            return "臨時任務處於審核或完結狀態，無法更新", False
        if self.user_id != duty_info.creator:
            return "不具備更新權限", False
        new_duty_nm = self.payload.get("duty_nm", "")
        if new_duty_nm:
            department = self.payload.get("department", duty_info.department)
            data = self.otdm.search_data_by_nm_exclude_id(
                new_duty_nm, department, duty_id
            )
            if data:
                return "duty_nm已存在", False
        content = self.__define_date()
        if content:
            return content, False
        duty_info = self.tdms.dump(duty_info)
        update_data = self.__format_update_data(duty_info)
        result, flag = self.otdm.update_data_by_id(duty_id, update_data)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__send_message_to_developers(duty_info)
            self.__handle_update_content(duty_info)
        if not flag:
            return result, flag
        flag = self.__assemble_duty_info(duty_info)
        if not flag:
            return "上傳檔案失敗", flag
        return result, flag
