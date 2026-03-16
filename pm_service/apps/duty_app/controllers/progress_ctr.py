# -*- coding: utf-8 -*-
"""
@文件: progress_ctr.py
@說明:
@時間: 2024/06/22 17:21:14
@作者: XuHeng
"""

from apps.duty_app.models import (OperTemporaryDutyApplyRecordModel,
                                  OperTemporaryDutyModel,
                                  OperTemporaryDutyRecordModel)
from common.common_minio import OperMinio
from common.common_tools import CommonTools
from apps.user_app.models import get_user_name
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import (TemporaryDutyApplyRecordModelSchema,
                                       TemporaryDutyModelSchema,
                                       TemporaryDutyRecordDataModelSchema)


class ProgressController:
    def __init__(self, payload=dict(), files_dict=dict()) -> None:
        self.tdrdms_dump = [
            "id",
            "progress_record",
            "path",
            "progress",
            "submitter",
            "time_consum",
            "cooperator",
            "reader",
            "created_at",
        ]
        self.files_dict = files_dict
        self.payload = payload
        self.otdm = OperTemporaryDutyModel()
        self.otdrm = OperTemporaryDutyRecordModel()
        self.tdrdms = TemporaryDutyRecordDataModelSchema(only=self.tdrdms_dump)
        self.om = OperMinio()

    def __search_data_by_id(self, empid, page, size):
        dump_fields = ["id", "duty_nm"]
        datalist, count = self.otdm.search_by_empid(empid, page, size)
        self.pdms = TemporaryDutyModelSchema(only=dump_fields, many=True)
        duty_data = self.pdms.dump(datalist)
        for i in range(len(datalist)):
            duty_data[i]["total_record_num"] = datalist[i].total_record_num
        return duty_data, count

    def get_record_num(self, payload, empid):
        page = payload.get("page", 1)
        size = payload.get("size", 10)
        datalist, count = self.__search_data_by_id(empid, page, size)
        total_page = CommonTools.get_total_page(size, count)
        return {"total_page": total_page, "total_count": count, "data_list": datalist}

    def __get_minio_path_param(self, duty_info, record_id):
        path = duty_info.get("path", "")
        path = f"{path}/record/{record_id}"
        return path

    def __get_pro_add_data(self, path, duty_id, empid, record_id):
        data_dict = {
            "id": record_id,
            "progress": self.payload.get("progress", 0),
            "progress_record": self.payload.get("progress_record", ""),
            "duty_id": duty_id,
            "submitter": empid,
            "time_consum": self.payload.get("time_consum", 0),
            "cooperator": ";".join(self.payload.get("cooperator", [])),
            "path": path,
            "reader": empid,
        }
        return data_dict

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

    def __upload_to_minio(self, path):
        for file_type, file_list in self.files_dict.items():
            project_io = self.__extract_upload_file(path, file_list, file_type)
            if project_io is False:
                return False
        return True

    def __insert_mysql(self, prm_data):
        tdrdms = TemporaryDutyRecordDataModelSchema()
        prd_data_obj = tdrdms.dump(prm_data)
        prd_data_obj = tdrdms.load(prd_data_obj)
        result, flag = self.otdrm.add_data_to_db(prd_data_obj)
        return result, flag

    def __get_duty_update_data(self, duty_info):
        progress = self.payload.get("progress", 0)
        time_consum = self.payload.get("time_consum", 0)
        if not (1 <= progress <= 100) or float(time_consum) < 0.0:
            return "請輸入正確數值", False
        else:
            insert_dict = {"progress": progress, "updated_at": CommonTools.get_now()}
            if duty_info.get("progress", 0) == 0:
                start_time = self.payload.get("start_time", "")
                # 更新功能表狀態=2
                insert_dict["status"] = 2
                insert_dict["start_time"] = start_time
                insert_dict["status_update_at"] = CommonTools.get_now()
            if progress == 100:
                insert_dict["status"] = 4
                insert_dict["end_time"] = CommonTools.get_now()
                insert_dict["status_update_at"] = CommonTools.get_now()
            return insert_dict, True

    def __add_apply_data(self, duty_id, empid, duty_info):
        data = {
            "duty_id": duty_id,
            "apply_type": "完結任務",
            "submitter": empid,
            "reviewer": duty_info["creator"],
            "priority": duty_info["priority"],
        }
        obj = TemporaryDutyApplyRecordModelSchema().load(data)
        return OperTemporaryDutyApplyRecordModel().add_data_to_db(obj)

    def __send_notice_to_relevant_people(self, duty_id, user_id, duty_info):
        responsible = duty_info.get("responsible", "").split(";")
        progress = self.payload.get("progress")
        name = get_user_name(user_id)
        link = f"{send_message_link[ENV]}approal"
        if progress == 100:
            message = f"{name}提交了({duty_info['duty_nm']})的任務完結申請，請及時處理，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, [duty_info["creator"]])
        else:
            link = f"{send_message_link[ENV]}task/{duty_id}"
            message = f"{name}更新了({duty_info['duty_nm']})的進度至{progress}%，請查閱，[点击查看]({link})。"
            if len(responsible) > 1:
                if user_id in responsible:
                    responsible.remove(user_id)
                SendMessageNotice.send_single_markdown(message, responsible)
            elif duty_info["creator"] not in responsible:
                SendMessageNotice.send_single_markdown(message, [duty_info["creator"]])

    def update_duty_record(self, user_id, duty_id):
        if not self.payload.get("progress_record") and not self.files_dict:
            return "進度內容與上傳文檔不能同時為空", False
        duty_info = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_info:
            return "temporary_duty_id不存在", False
        if user_id not in duty_info.responsible:
            return "不具備更新權限", False
        if duty_info.status not in [1, 2]:
            return "任務處於審核或完結狀態，無法更新進度", False
        record_id = CommonTools.get_timestamp()
        duty_info = TemporaryDutyModelSchema().dump(duty_info)
        _path = self.__get_minio_path_param(duty_info, record_id)
        pro_dict = self.__get_pro_add_data(_path, duty_id, user_id, record_id)
        flag = self.__upload_to_minio(_path)
        if not flag:
            return "上傳檔案失敗", flag
        result, flag = self.__insert_mysql(pro_dict)
        if flag:
            update_data, flag = self.__get_duty_update_data(duty_info)
            if not flag:
                return update_data, flag
            result, flag = self.otdm.update_data_by_id(duty_id, update_data)
        if flag and self.payload.get("progress") == 100:
            result, flag = self.__add_apply_data(duty_id, user_id, duty_info)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__send_notice_to_relevant_people(duty_id, user_id, duty_info)
            return _path, flag
        return result, flag

    def __get_datalists(self, project_data, reader_list):
        datalist = self.tdrdms.dump(project_data, many=True)
        for data in datalist:
            progress_id = data.pop("id")
            data["progress_id"] = progress_id
            reader = data.pop("reader")
            reader_list.append((progress_id, reader))
            file_path = data.pop("path")
            if file_path:
                filedata, flag = self.om.get_all_files_info_by_path(BUCKET, file_path)
                if not flag:
                    print("獲取進度附件失敗")
                    continue
                file_info_dic = CommonTools.convert_file_info_to_dict(filedata)
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
            result, flag = self.otdrm.update_data_to_db({"reader": reader}, data[0])
            if not flag:
                break
        return DBFunction.do_commit(result, flag)

    def get_duty_process_detail(self, payload, duty_id, user_id):
        duty_info = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_info:
            return "該任務不存在", False
        unread = payload.get("unread", 0)
        page = payload.get("page", 1)
        size = payload.get("size", 5)
        datalist, total_count = self.otdrm.search_data_by_duty_id(
            duty_id, user_id, page, size, unread
        )
        reader_list = list()
        datalists = self.__get_datalists(datalist, reader_list)
        self.__update_reader(reader_list, user_id)
        total_page = CommonTools.get_total_page(size, total_count)
        content = {
            "total_page": total_page,
            "total_count": total_count,
            "data_list": datalists,
        }
        return content, True
