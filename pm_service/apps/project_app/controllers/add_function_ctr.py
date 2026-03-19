import re
import time

from flask import request

from apps.project_app.models import (
    OperFunctionDataModel,
    OperProjectApplyRecordModel,
    OperProjectDataModel,
)
from common.common_minio import OperMinio
from common.common_tools import get_timestamp
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import (
    FunctionDataModelSchema,
    ProjectApplyRecordModelSchema,
    ProjectDataModelSchema,
)
from common.oper_log import add_operation_record


class AddFunctionController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.pdms = ProjectDataModelSchema()
        self.ofdm = OperFunctionDataModel()
        self.fdms = FunctionDataModelSchema()
        self.om = OperMinio()

    def __define_date(self, payload):
        exp_start_date = payload.get("expected_start_date")
        exp_end_date = payload.get("expected_end_date")
        if not exp_start_date and not exp_end_date:
            return "", True
        if (exp_start_date and not exp_end_date) or (
            not exp_start_date and exp_end_date
        ):
            return "開始日期與結束日期需同時存在", False
        start = time.strptime(exp_start_date, "%Y-%m-%d")
        end = time.strptime(exp_end_date, "%Y-%m-%d")
        if start > end:
            return "結束日期不可早於開始日期", False
        return "", True

    def __extract_upload_file(self, file_list, file_type, file_path):
        for file in file_list:
            file_name = file.filename
            file_data = file.stream.read()
            if not self.om.upload_stream_file(
                BUCKET,
                f"{file_path}/{file_type}/{file_name}",
                file_data,
            ):
                return False

    def __upload_pro_file_to_minio(self, file_path, files_dict):
        for file_type, file_list in files_dict.items():
            function_info = self.__extract_upload_file(file_list, file_type, file_path)
            if function_info is False:
                return False
        return True

    def __hadle_function_nm(self, function_info):
        function_nm = re.sub(
            r"[^a-zA-Z0-9\u4e00-\u9fa5]+", "_", function_info["function_nm"]
        )
        return function_nm

    def __get_function_info_obj(self, project_data, project_id, payload):
        function_info = payload.copy()
        id = get_timestamp()
        function_info["id"] = id
        function_nm = self.__hadle_function_nm(function_info)
        function_info["path"] = (
            f"{project_data['path']}/function/{function_nm}_{function_info['id']}"
        )
        if payload.get("developers"):
            function_info["developers"] = ";".join(payload["developers"])
        if payload.get("reviewer", ""):
            function_info["status"] = 4
        function_info["project_id"] = project_id
        function_info_obj = self.fdms.dump(function_info)
        function_info_obj = self.fdms.load(function_info_obj)
        return function_info, function_info_obj

    def __add_apply_data(self, pid, fid, payload, empid):
        data = {
            "project_id": pid,
            "function_id": fid,
            "apply_type": "創建功能",
            "submitter": empid,
            "reviewer": ";".join(payload["reviewer"]),
            "priority": payload["priority"],
        }
        obj = ProjectApplyRecordModelSchema().load(data)
        return OperProjectApplyRecordModel().add_data_to_db(obj)

    def __add_developers_data(self, project_data, payload, project_id):
        developers = payload.get("developers")
        if developers:
            if project_data.get("developers"):
                pro_developers = project_data.get("developers").split(";")
                developers = list(set(pro_developers + developers))
            data = {
                "id": project_id,
                "developers": ";".join(developers),
            }
            return self.opdm.update_developers_by_pid(project_id, data)
        return "", True

    def __send_message_to_developers(self, payload, project_data, empid):
        developers = payload.get("developers", [])
        function_nm = payload["function_nm"]
        reviewer = payload.get("reviewer", [])
        name = get_user_name(empid)
        if len(developers) > 0:
            link = f"{send_message_link[ENV]}projects/{project_data['id']}"
            message = f"{name}在({project_data['project_nm']})專案中給您分配了一項待處理任務({function_nm})，請及时处理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, developers)
        elif len(reviewer) > 0:
            link = f"{send_message_link[ENV]}approal"
            message = f"{name}在({project_data['project_nm']})專案中新增一项任務({function_nm})，請及时处理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, reviewer)

    def __write_operation_log(self, user_id, function_info):
        add_operation_record(
            operator=user_id,
            action="create_function",
            status="success",
            matter=f"创建名稱為{function_info['function_nm']}({function_info['id']})的任務",
            ip=request.headers.get("X-Real-IP", ""),
            matter_id=function_info['id'],
        )

    def process_add_function(self, payload, project_id, files_dict, empid):
        project_data = self.opdm.search_data_by_id(project_id)
        if not project_data:
            return "project_id不存在", False
        if self.ofdm.search_data_by_project_id_and_function_nm(project_id, payload):
            return "任務名稱已存在", False
        result, flag = self.__define_date(payload)
        if not flag:
            return result, flag
        project_data = self.pdms.dump(project_data)
        function_info, function_info_obj = self.__get_function_info_obj(
            project_data, project_id, payload
        )
        result, flag = self.ofdm.add_data_to_db(function_info_obj)
        if payload.get("reviewer", ""):
            fid = function_info["id"]
            result, flag = self.__add_apply_data(project_id, fid, payload, empid)
        if payload.get("developers"):
            result, flag = self.__add_developers_data(project_data, payload, project_id)
        result, flag = DBFunction.do_commit(result, flag)
        if not flag:
            return f"任務創建失敗: {result}", flag
        minio_res = self.__upload_pro_file_to_minio(function_info["path"], files_dict)
        if minio_res is False:
            result = "上傳檔案失敗"
        if flag:
            self.__send_message_to_developers(payload, project_data, empid)
            self.__write_operation_log(empid, function_info)
        return result, flag
