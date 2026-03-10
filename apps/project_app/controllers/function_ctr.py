# -*- coding: utf-8 -*-
"""
@文件: function_ctr.py
@說明:
@時間: 2024/07/17 15:47:05
@作者: LiDong
"""


from flask import request

from apps.project_app.models import OperFunctionDataModel, OperProjectDataModel
from common.common_minio import OperMinio
from common.common_tools import CommonTools
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from influxDB.influxdb_oper import oper_fluxdb
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProjectDataModelSchema)


class FunctionUpdateController:
    def __init__(self) -> None:
        self.OPPM = OperProjectDataModel()
        self.ofdm = OperFunctionDataModel()
        self.OpMinio = OperMinio()
        self.ProjectSchema = ProjectDataModelSchema()
        self.FunctionSchema = FunctionDataModelSchema()

    def is_deletable(self, empid, project_id):
        data = self.OPPM.search_data_by_id(project_id)
        serialize_data = self.ProjectSchema.dump(data)
        project_pm = serialize_data.get("project_pm", "")
        for pm in project_pm.split(";"):
            if empid == pm.strip():
                return True
        return False

    def check_if_exists(self, project_id, function_id):
        data = self.ofdm.search_fun_data_by_fid(project_id, function_id)
        if not data:
            return False
        return True

    def __send_message_to_developers(self, pro_data, fun_data, empid, developers):
        link = f"{send_message_link[ENV]}projects/{pro_data.id}"
        name = get_user_name(empid)
        if fun_data.developers:
            fun_developers = fun_data.developers.split(";")
            if len(developers) > len(fun_developers):
                missing_developers = [
                    dev for dev in developers if dev not in fun_developers
                ]
                developers = [dev for dev in developers if dev in fun_developers]
                message = f"您好，{name}在({pro_data.project_nm}-{fun_data.function_nm})任務中新增開發者，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, developers)
                message = f"您好，{name}在({pro_data.project_nm})專案中給您分配了一項待處理任務({fun_data.function_nm})，請及时处理，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, missing_developers)
        else:
            message = f"您好，{name}在({pro_data.project_nm})專案中給您分配了一項待處理任務({fun_data.function_nm})，請及时处理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, developers)

    def record_to_mysql(self, pid, fid, payload, pro_data, fun_data, empid):
        developers = payload.get("developers", list())
        if developers:
            payload["developers"] = ";".join(developers)
            update_data = {"id": pid, "developers": ";".join(developers)}
            if pro_data.developers:
                pro_developers = pro_data.developers
                pro_developers = list(set(pro_developers.split(";") + developers))
                update_data = {"id": pid, "developers": ";".join(pro_developers)}
            result, flag = self.OPPM.update_developers_by_pid(pid, update_data)
            if flag:
                self.__send_message_to_developers(pro_data, fun_data, empid, developers)
        result, flag = self.ofdm.update_data(fid, payload)
        return DBFunction.do_commit(result, flag)

    def extract_upload_file(self, fdict, file_path):
        for file_type, file_val in fdict.items():
            for file in file_val:
                file_name = file.filename
                file_data = file.stream.read()
                if not self.OpMinio.upload_stream_file(
                    BUCKET,
                    f"{file_path}/{file_type}/{file_name}",
                    file_data,
                ):
                    return False
        return True

    def __handle_update_content(self, payload, empid, function_data):
        if payload["function_nm"] != function_data["function_nm"]:
            details = f"將{function_data['function_nm']}任務名称修改為{payload['function_nm']}"
            self.__write_data_to_influxdb(empid, details)
        if function_data["priority"] != payload["priority"]:
            if payload["priority"] == 1:
                priority = "正常"
            elif payload["priority"] == 2:
                priority = "緊急"
            details = f"將{function_data['function_nm']}任務優先級修改為{priority}"
            self.__write_data_to_influxdb(empid, details)

    def __write_data_to_influxdb(self, user_id, details):
        oper_fluxdb.add_record(
            user_id,
            "update_function",
            "success",
            details,
            request.headers.get("X-Real-IP"),
        )

    def update_function(self, empid, fdict, pid, fid, payload):
        fun_data = self.ofdm.search_fun_data_by_fid(pid, fid)
        pro_data = self.OPPM.search_data_by_id(pid)
        fdata = self.FunctionSchema.dump(fun_data)
        function_data = fdata.copy()
        if not fun_data:
            return f"{pid} or {fid} 不存在！", False
        if not self.is_deletable(empid, pid):
            return "無更新權限", False
        result, flag = self.record_to_mysql(
            pid, fid, payload, pro_data, fun_data, empid
        )
        if not flag:
            return result, flag
        file_path = fdata.get("path", "")
        if not file_path:
            return "路徑不存在", False
        minio_flag = self.extract_upload_file(fdict, file_path)
        if not minio_flag:
            return "文件上傳失敗", minio_flag
        self.__handle_update_content(payload, empid, function_data)
        return result, minio_flag


class FunctionSetStatusController:

    def __delete(self, user_id, project_id, func_id):
        fdc = FunctionDeleteController()
        return fdc.delete_function(user_id, project_id, func_id)

    def __pause(self, user_id, project_id, func_id):
        ofdm = OperFunctionDataModel()
        data = ofdm.search_func_by_id(user_id, project_id, func_id)
        if not data:
            return "無此權限", False
        data.last_status = data.status
        data.status = 8
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("任務已暫停", True)

    def __restore(self, user_id, project_id, func_id):
        ofdm = OperFunctionDataModel()
        data = ofdm.search_func_by_id(user_id, project_id, func_id, [8])
        if not data:
            return "無此權限", False
        data.status = data.last_status
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("任務已恢復", True)

    def run(self, user_id, project_id, func_id, payload):
        status = payload["status"]
        if status == 0:
            return self.__delete(user_id, project_id, func_id)
        elif status == 8:
            return self.__pause(user_id, project_id, func_id)
        elif status == 9:
            return self.__restore(user_id, project_id, func_id)
        return "status 輸入參數錯誤", False


class FunctionDeleteController(FunctionUpdateController):
    def __init__(self) -> None:
        self.OPPM = OperProjectDataModel()
        self.ofdm = OperFunctionDataModel()
        self.OpMinio = OperMinio()
        self.ProjectSchema = ProjectDataModelSchema()
        self.FunctionSchema = FunctionDataModelSchema()

    def __delete_check_if_exists(self, project_id, function_id):
        data = self.ofdm.search_fun_data_by_fid(project_id, function_id)
        return data

    def __write_data_to_influxdb(self, data, user_id):
        oper_fluxdb.add_record(
            user_id,
            "delete_function",
            "success",
            f"刪除名稱為{data.function_nm}({data.id})的任務",
            request.headers.get("X-Real-IP"),
        )

    def delete_function(self, empid, project_id, function_id):
        data = self.__delete_check_if_exists(project_id, function_id)
        if not data:
            return f"{project_id} or {function_id} 不存在！", False
        elif data.status in [3, 4]:
            return "功能处于審核或完成狀態,不可刪除", False
        if not self.is_deletable(empid, project_id):
            return "無更新權限！", False
        result, flag = self.ofdm.update_status_to_deleted(function_id)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__write_data_to_influxdb(data, empid)
        return result, flag


class FunctionAllocationController(FunctionUpdateController):
    def __init__(self) -> None:
        super().__init__()
        self.ofdm = OperFunctionDataModel()

    def task_distribution(self, empid, project_id, function_id, payload):
        fun_data = self.ofdm.search_fun_data_by_fid(project_id, function_id)
        if not fun_data:
            return f"{project_id} or {function_id} 不存在！", False
        if not self.is_deletable(empid, project_id):
            return "無更新權限", False
        pro_data = self.OPPM.search_data_by_id(project_id)
        _end_date = fun_data.expected_end_date
        if _end_date and _end_date != payload.get("expected_end_date"):
            expected_end_date = payload.pop("expected_end_date")
            payload["latest_expected_end_date"] = expected_end_date
            revision_count = fun_data.revision_count
            if revision_count:
                revision_count += 1
            else:
                revision_count = 1
            payload["revision_count"] = revision_count
        result, flag = self.record_to_mysql(
            project_id, function_id, payload, pro_data, fun_data, empid
        )
        return result, flag


class FunctionDetailsController:
    def __init__(self) -> None:
        self.ofdm = OperFunctionDataModel()
        self.minio = OperMinio()
        self.bucket = BUCKET

    def check_if_exists(self, project_id, func_id):
        data = self.ofdm.search_fun_data_by_fid(project_id, func_id)
        if not data:
            return False
        return True

    def __delete_record_file(self, file_list):
        result = list()
        for file in file_list:
            if "/record/" not in file["file_url"]:
                result.append(file)
        return result

    def query_task_details(self, project_id, function_id):
        fd_data = self.ofdm.search_fun_data_by_fid(project_id, function_id)
        if not fd_data:
            return f"{project_id} or {function_id} is not exist!", False
        datalist_dic = {}
        select_cols = ["path"]
        fdms = FunctionDataModelSchema(only=select_cols)
        datalist = fdms.dump(fd_data)
        file_path = datalist["path"]
        if file_path:
            file_info, flag = self.minio.get_all_files_info_by_path(BUCKET, file_path)
            if not flag:
                return "暫無數據", flag
            file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
            files = file_info_dic.get("files", [])
            datalist_dic["files"] = self.__delete_record_file(files)
            images = file_info_dic.get("images", [])
            datalist_dic["images"] = self.__delete_record_file(images)
            videos = file_info_dic.get("videos", [])
            datalist_dic["videos"] = self.__delete_record_file(videos)
            return datalist_dic, flag
        return "路徑不存在", False
