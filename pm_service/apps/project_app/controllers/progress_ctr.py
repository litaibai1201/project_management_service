# -*- coding: utf-8 -*-
"""
@文件: progress_ctr.py
@說明:
@時間: 2024/07/19 15:08:12
@作者: LiDong
"""


from functools import cached_property

from apps.project_app.controllers.pro_common import get_total_page
from apps.project_app.models import (OperFunctionDataModel,
                                     OperProgressRecordDataModel,
                                     OperProjectApplyRecordModel,
                                     OperProjectDataModel)
from common.common_minio import OperMinio
from common.common_tools import CommonTools, get_now, get_timestamp
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProgressRecordDataModelSchema,
                                       ProjectApplyRecordModelSchema)


class CreateProgressController:
    def __init__(self) -> None:
        self.opprm = OperProgressRecordDataModel()
        self.opfm = OperFunctionDataModel()
        self.fdms = FunctionDataModelSchema()
        self.prdms = ProgressRecordDataModelSchema()
        self.om = OperMinio()
        self.opdm = OperProjectDataModel()

    def is_qualified(self, serialize_data, empid):
        developers = serialize_data.get("developers", "")
        if empid in developers:
            return True
        return False

    def get_fun_data_by_id(self, pid, fid):
        data = self.opfm.search_func_data_and_project_pm(pid, fid)
        if not data:
            return dict()
        serialize_data = self.fdms.dump(data[0])
        serialize_data["project_pm"] = data.project_pm
        return serialize_data

    def __get_fm_update_data(self, func_data, payload):
        progress = payload.get("progress", 0)
        time_consum = payload.get("time_consum", 0)
        if not (1 <= progress <= 100) or float(time_consum) < 0.0:
            return "請輸入正確數值", False
        else:
            insert_dict = {"progress": progress, "updated_at": get_now()}
            if func_data.get("progress", 0) == 0:
                start_time = payload.get("start_time", "")
                # 更新功能表狀態=2
                insert_dict["status"] = 2
                insert_dict["start_time"] = start_time
                insert_dict["status_update_at"] = get_now()
            if progress == 100:
                insert_dict["status"] = 4
                insert_dict["end_time"] = get_now()
                insert_dict["status_update_at"] = get_now()
            return insert_dict, True

    def __get_prm_add_data(self, payload, func_data, fid, empid, record_id):
        path = self.__get_minio_path_param(func_data, record_id)
        prm_dict = {
            "id": record_id,
            "progress": payload.get("progress", 0),
            "progress_record": payload.get("progress_record", ""),
            "function_id": fid,
            "submitter": empid,
            "time_consum": payload.get("time_consum", 0),
            "cooperator": ";".join(payload.get("cooperator", [])),
            "path": path,
            "reader": empid,
        }
        return prm_dict

    def __get_minio_path_param(self, func_data, record_id):
        path = func_data.get("path", "")
        path = f"{path}/record/{record_id}"
        return path

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

    def __upload_pro_file_to_minio(self, path, fdict):
        for file_type, file_list in fdict.items():
            project_io = self.__extract_upload_file(path, file_list, file_type)
            if project_io is False:
                return False
        return True

    def __insert_mysql(self, prm_data):
        prd_data_obj = self.prdms.dump(prm_data)
        prd_data_obj = self.prdms.load(prd_data_obj)
        result, flag = self.opprm.add_data_to_db(prd_data_obj)
        return result, flag

    def __add_apply_data(self, pid, fid, empid, func_data):
        data = {
            "project_id": pid,
            "function_id": fid,
            "apply_type": "完結功能",
            "submitter": empid,
            "reviewer": func_data["project_pm"],
            "priority": func_data["priority"],
        }
        obj = ProjectApplyRecordModelSchema().load(data)
        return OperProjectApplyRecordModel().add_data_to_db(obj)

    def __send_notice_to_relevant_people(self, empid, pid, fid, payload):
        progress = payload.get("progress")
        name = get_user_name(empid)
        link = f"{send_message_link[ENV]}projects/{pid}"
        pro_data = self.opdm.search_data_by_id(pid)
        fun_data = self.opfm.search_fun_data_by_fid(pid, fid)
        product_pm = pro_data.product_pm.split(";")
        project_pm = pro_data.project_pm.split(";")
        creator = [pro_data.creator]
        developers = fun_data.developers.split(";")
        ids = list(set(product_pm + project_pm + creator))
        if progress == 100:
            link = f"{send_message_link[ENV]}approal"
            message = f"{name}提交了({pro_data.project_nm})專案中({fun_data.function_nm})的任務完結申請，請及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, project_pm)
        else:
            message = f"{name}更新了({pro_data.project_nm})專案中({fun_data.function_nm})的進度至{progress}%，請查閱，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, ids)
            if len(developers) > 1:
                if empid in developers:
                    developers.remove(empid)
                message = f"{name}更新了({pro_data.project_nm})專案中({fun_data.function_nm})的進度至{progress}%，請查閱，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, developers)

    def create_progress(self, payload, pid, fid, empid, fdict):
        if not payload.get("progress_record") and not fdict:
            return "進度內容與上傳文檔不能同時為空", False
        func_data = self.get_fun_data_by_id(pid, fid)
        if not self.is_qualified(func_data, empid):
            return "無新增記錄資格", False
        id = get_timestamp()
        prm_data = self.__get_prm_add_data(payload, func_data, fid, empid, id)
        flag = self.__upload_pro_file_to_minio(prm_data["path"], fdict)
        if not flag:
            return "上傳檔案失敗", flag
        result, flag = self.__insert_mysql(prm_data)
        if flag:
            fm_insert_data, flag = self.__get_fm_update_data(func_data, payload)
            if not flag:
                return fm_insert_data, flag
            result, flag = self.opfm.update_data(fid, fm_insert_data)
        if flag and payload.get("progress") == 100:
            result, flag = self.__add_apply_data(pid, fid, empid, func_data)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__send_notice_to_relevant_people(empid, pid, fid, payload)
            return prm_data["path"], flag
        return result, flag


class ProgressDataController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.oprdm = OperProgressRecordDataModel()
        self.minio = OperMinio()
        self.bucket = BUCKET

    @cached_property
    def record_schema(self):
        select_cols = [
            "id",
            "progress_record",
            "progress",
            "submitter",
            "created_at",
            "cooperator",
            "path",
            "reader",
            "time_consum",
        ]
        prdms = ProgressRecordDataModelSchema(many=True, only=select_cols)
        return prdms

    def __get_prm(self, payload):
        page_num = payload.get("page", 1)
        count = payload.get("size", 5)
        return page_num, count

    def __get_datalists(self, project_data, reader_list):
        datalist = self.record_schema.dump(project_data)
        for data in datalist:
            progress_id = data.pop("id")
            data["progress_id"] = progress_id
            reader = data.pop("reader")
            reader_list.append((progress_id, reader))
            file_path = data.pop("path")
            if file_path:
                file_info, flag = self.minio.get_all_files_info_by_path(
                    BUCKET, file_path
                )
                if not flag:
                    print("獲取進度附件失敗")
                    continue
                file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
                data["files"] = file_info_dic.get("files", [])
                data["images"] = file_info_dic.get("images", [])
        return datalist

    def __update_reader(self, reader_list, empid):
        result, flag = False, False
        for data in reader_list:
            if not data[1]:
                reader = empid
            elif empid in data[1]:
                continue
            else:
                reader = data[1] + ";" + empid
            result, flag = self.oprdm.update_data_to_db({"reader": reader}, data[0])
            if not flag:
                break
        return DBFunction.do_commit(result, flag)

    def get_progress_datas(self, payload, empid, fid):
        page, size = self.__get_prm(payload)
        unread = payload.get("unread", 0)
        datalist, total_count = self.oprdm.search_data_by_empid(
            empid, fid, page, size, unread
        )
        reader_list = list()
        datalists = self.__get_datalists(datalist, reader_list)
        self.__update_reader(reader_list, empid)
        total_page = get_total_page(size, total_count)
        content = {
            "total_page": total_page,
            "total_count": total_count,
            "data_list": datalists,
        }
        return content
