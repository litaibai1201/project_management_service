# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
import re

from flask import request

from apps.project_app.models import (OperProjectApplyRecordModel,
                                     OperProjectDataModel)
from common.common_minio import OperMinio
from common.common_tools import get_empid_department_info, get_timestamp
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from influxDB.influxdb_oper import oper_fluxdb
from serialize.model_serizlize import (ProjectApplyRecordModelSchema,
                                       ProjectDataModelSchema)


class CreateProjectController:
    def __init__(self, payload, user_id, files_dict) -> None:
        self.opdm = OperProjectDataModel()
        self.oparm = OperProjectApplyRecordModel()
        self.om = OperMinio()
        self.pdms = ProjectDataModelSchema()
        self.oparms = ProjectApplyRecordModelSchema()
        self.payload = payload
        self.user_id = user_id
        self.files_dict = files_dict

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

    def __upload_pro_file_to_minio(self, project_info):
        for file_type, file_list in self.files_dict.items():
            project_io = self.__extract_upload_file(
                project_info["path"], file_list, file_type
            )
            if project_io is False:
                return False
        return True

    def __hadle_project_nm(self, payload):
        project_nm = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]+", "_", payload["project_nm"])
        return project_nm

    def __get_project_obj(self):
        project_info = self.payload.copy()
        id = get_timestamp()
        project_nm = self.__hadle_project_nm(self.payload)
        project_info["id"] = id
        project_info["path"] = f"{self.payload['department']}/project/{project_nm}_{id}"
        project_info["creator"] = self.user_id
        project_info["status"] = 1
        if not self.payload.get("product_pm"):
            project_info["product_pm"] = self.user_id
        project_obj = self.pdms.dump(project_info)
        project_obj = self.pdms.load(project_obj)
        return project_info, project_obj

    def __send_message_to_related_personnel(self, project_info):
        link = f"{send_message_link[ENV]}projects/{project_info['id']}"
        content = get_empid_department_info(self.user_id)
        product_pm, project_pm, project_nm = (
            self.payload.get("product_pm", ""),
            self.payload.get("project_pm", ""),
            self.payload.get("project_nm", ""),
        )
        same_message = f"您好，{content['chnname']}創建了新的專案({project_nm})"
        if project_pm == product_pm:
            message = f"{same_message}，您被其分配為專案PM和系統分析師，請您及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, [product_pm])
        else:
            message = f"{same_message}，您被其分配為專案PM，請您及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, [product_pm])
            message = f"{same_message}，您被其分配為系統分析師，請您及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, [project_pm])

    def __write_data_to_influxdb(self, project_info):
        oper_fluxdb.add_record(
            self.user_id,
            "create_project",
            "success",
            f"创建名稱為{self.payload['project_nm']}({project_info['id']})的專案",
            request.headers.get("X-Real-IP"),
        )

    def process_create_project(self):
        if self.opdm.search_data_by_project_nm_and_department(self.payload):
            return "專案名稱已存在", False
        project_info, project_obj = self.__get_project_obj()
        result, flag = self.opdm.add_data_to_db(project_obj)
        if not flag:
            DBFunction.db_rollback()
            return "專案數據插入失敗", flag
        result, flag = DBFunction.do_commit(result, flag)
        if flag is False:
            return result, flag
        result = {"project_id": project_info["id"]}
        flag = self.__upload_pro_file_to_minio(project_info)
        if flag:
            self.__send_message_to_related_personnel(project_info)
            self.__write_data_to_influxdb(project_info)
            return result, flag
        return "上傳檔案失敗!", flag

    def list_to_string(input_list, delimiter=";"):
        return delimiter.join(input_list)
