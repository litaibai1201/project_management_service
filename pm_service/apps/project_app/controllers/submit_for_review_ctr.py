# -*- coding: utf-8 -*-
"""
@文件: submit_for_review_ctr.py
@說明: submit_for_review
@時間: 2024/08/06 08:24:19
@作者: ChenChiauShin
"""
from apps.project_app.models import (OperProjectApplyRecordModel,
                                     OperProjectDataModel)
from common.common_minio import OperMinio
from common.common_tools import get_now
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import ProjectApplyRecordModelSchema


class SubmitForReviewController:
    def __init__(self, payload, user_id) -> None:
        super().__init__()
        self.reviewer = payload.get("reviewer")
        self.status = payload.get("status")
        self.user_id = user_id
        self.opdm = OperProjectDataModel()
        self.minio = OperMinio()
        self.oparm = OperProjectApplyRecordModel()
        self.bucket = BUCKET

    def __permissions_available(self, project_db):
        if self.status == 1 and project_db.product_pm != self.user_id:
            return False
        elif self.status == 3 and project_db.project_pm != self.user_id:
            return False
        return True

    def __trans_status(self, project_db):
        if self.status == 1:
            become_status = 2
        elif self.status == 3:
            for file_type in [
                "architecture_diagram",
                "flowchart",
                "interface_design_drawing",
                "interface_documentation",
                "datasheet_documentation",
            ]:
                path = f"{project_db.path}/{file_type}"
                if not self.minio.search_files(BUCKET, folder_name=path):
                    return False
            become_status = 4
        return become_status

    def __get_pro_apply_record_obj(self, project_db, bc_status):
        project_info = {}
        if bc_status == 2:
            project_info["apply_type"] = "創建專案"
        else:
            project_info["apply_type"] = "規劃審核"
        project_info["project_id"] = project_db.id
        project_info["submitter"] = self.user_id
        project_info["reviewer"] = ";".join(self.reviewer)
        project_info["status"] = 1
        project_info["created_at"] = get_now()
        project_info["priority"] = project_db.priority
        return project_info

    def __send_message_to_reviewer(self, project_db, bc_status):
        link = f"{send_message_link[ENV]}approal"
        if bc_status == 2:
            mesaage_type = f"新增專案({project_db.project_nm})的立案申請"
        elif bc_status == 4:
            mesaage_type = f"({project_db.project_nm})的架構及任務排程申請"
        name = get_user_name(self.user_id)
        message = f"您好，{name}在專案管理系統上提交了一條關於{mesaage_type}，請您及時處理，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, self.reviewer)

    def submit_for_review(self, project_id):
        project_db = self.opdm.search_data_by_id(project_id)
        if not project_db:
            return "project_id不存在", False
        if project_db.status != self.status:
            return "狀態錯誤", False
        if not self.__permissions_available(project_db):
            return "無此權限", False
        bc_status = self.__trans_status(project_db)
        if not bc_status:
            return "專案資料未齊全", False
        project_info = self.__get_pro_apply_record_obj(project_db, bc_status)
        obj = ProjectApplyRecordModelSchema().load(project_info)
        result, flag = self.oparm.add_data_to_db(obj)
        if flag:
            result, flag = self.opdm.update_status_by_pid(project_id, bc_status)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__send_message_to_reviewer(project_db, bc_status)
        return result, flag
