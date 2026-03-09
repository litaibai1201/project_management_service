# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
import re
import time

from flask import request

from apps.duty_app.models import (OperTemporaryDutyApplyRecordModel,
                                  OperTemporaryDutyModel)
from common.common_minio import OperMinio
from common.common_tools import CommonTools, get_empid_department_info
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from influxDB.influxdb_oper import oper_fluxdb
from serialize.model_serizlize import (TemporaryDutyApplyRecordModelSchema,
                                       TemporaryDutyModelSchema)


class CreateTemporaryDutyController:
    def __init__(self, payload, user_id, files_dict) -> None:
        self.otdm = OperTemporaryDutyModel()
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

    def __hadle_duty_nm(self, duty_info):
        duty_nm = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]+", "_", duty_info["duty_nm"])
        return duty_nm

    def __format_duty_obj(self):
        duty_info = self.payload.copy()
        id = CommonTools.get_timestamp()
        duty_info["id"] = id
        duty_nm = self.__hadle_duty_nm(duty_info)
        path = f'{duty_info["department"]}/duty/{duty_nm}_{id}'
        duty_info["path"] = path
        duty_info["creator"] = self.user_id
        if duty_info.get("reviewer") and self.payload["reviewer"][0] != "":
            duty_info["status"] = 4
        responsible = ";".join(duty_info.get("responsible", list()))
        duty_info["responsible"] = responsible
        tdms = TemporaryDutyModelSchema()
        duty_info = tdms.dump(duty_info)
        duty_obj = tdms.load(duty_info)
        return duty_info, duty_obj

    def __format_apply_obj(self, duty_info, reviewer):
        apply_dict = dict()
        apply_dict["apply_type"] = "創建任務"
        apply_dict["duty_id"] = duty_info["id"]
        apply_dict["submitter"] = self.user_id
        apply_dict["reviewer"] = ";".join(reviewer)
        apply_dict["priority"] = duty_info["priority"]
        tdrrms = TemporaryDutyApplyRecordModelSchema()
        apply_obj = tdrrms.load(apply_dict)
        odarrm = OperTemporaryDutyApplyRecordModel()
        return odarrm.add_data_to_db(apply_obj)

    def __send_notice_to_relevant_people(self, duty_info):
        reviewer = self.payload.get("reviewer", [])
        responsible = self.payload.get("responsible", [])
        content = get_empid_department_info(self.user_id)
        link = f"{send_message_link[ENV]}task/{duty_info['id']}"
        if len(responsible) > 0:
            message = f"您好，{content['chnname']}給您分配了一項臨時任務({self.payload['duty_nm']})，請您及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, responsible)
        if len(reviewer) > 0:
            link = f"{send_message_link[ENV]}approal"
            message = f"您好，{content['chnname']}提交了一條關於新增臨時任務({self.payload['duty_nm']})的立案申請，請您及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, reviewer)

    def __write_data_to_influxdb(self, duty_info):
        oper_fluxdb.add_record(
            self.user_id,
            "create_duty_task",
            "success",
            f"创建名稱為{self.payload['duty_nm']}({duty_info['id']})的臨時任務",
            request.headers.get("X-Real-IP"),
        )

    def process_create_temporary_duty(self):
        if self.otdm.check_if_exist(self.payload, self.user_id):
            return f"工號{self.user_id}下已有該條臨時任務", False
        content = self.__define_date()
        if content:
            return content, False
        duty_info, duty_obj = self.__format_duty_obj()
        result, flag = self.otdm.add_data_to_db(duty_obj)
        reviewer = self.payload.get("reviewer", list())
        if flag:
            if reviewer and reviewer[0] != "":
                result, flag = self.__format_apply_obj(duty_info, reviewer)
        result, flag = DBFunction.do_commit(result, flag)
        if not flag:
            return result, flag
        result = {"duty_id": duty_info["id"]}
        flag = self.__assemble_duty_info(duty_info)
        if flag:
            self.__send_notice_to_relevant_people(duty_info)
            self.__write_data_to_influxdb(duty_info)
            return result, flag
        return "上傳檔案失敗！", flag
