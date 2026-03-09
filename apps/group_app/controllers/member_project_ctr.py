# -*- coding: utf-8 -*-
"""
@文件: member_project_ctr.py
@說明:
@時間: 2024/07/27 14:30:51
@作者: LiDong
"""


import math
from datetime import datetime

from apps.group_app.models import OperMemberDataModel, OperProjectGroupModel
from common.common_tools import CommonTools
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProgressRecordDataModelSchema,
                                       ProjectDataModelSchema)


class MemberProjectController:
    def __init__(self, payload, member) -> None:
        self.size = payload.get("size", 5)
        self.page = payload["page"]
        self.start_date = payload.get("start_date", CommonTools.get_now("date"))
        self.end_date = payload.get("end_date", CommonTools.get_now("date"))
        self.time_type = payload.get("time_type", 0)
        self.member = member
        self.data_list = []
        self.omdm = OperMemberDataModel()
        self.pdms = ProjectDataModelSchema()
        self.fdms = FunctionDataModelSchema()
        self.fprdms = ProgressRecordDataModelSchema()
        self.opgm = OperProjectGroupModel()

    def __calc_total_working_hour(self, fun_data):
        time_limit = datetime.strptime("12:00:00", "%H:%M:%S").time()
        if fun_data.get("start_time") and fun_data.get("end_time"):
            start_time = datetime.strptime(fun_data["start_time"], "%Y-%m-%d %H:%M:%S")
            end_time = datetime.strptime(fun_data["end_time"], "%Y-%m-%d %H:%M:%S")
            time_interval = end_time - start_time
            time_interval = end_time - start_time
            start_week = start_time.isocalendar()[1]
            end_week = end_time.isocalendar()[1]
            week_num = end_week - start_week
            if start_time.time() <= time_limit and end_time.time() > time_limit:
                result = time_interval.days * 8 + (time_interval.seconds / 3600 - 1.5)
            else:
                result = time_interval.days * 8 + time_interval.seconds / 3600
            result = float(result) - week_num * 2 * 8
            return round(result, 2)
        return None

    def __submit_total_working_hour(self, fun_data, record_data):
        total_hour = 0
        for data in record_data:
            if data[0] == fun_data.get("id"):
                total_hour += float(data[1])
        return total_hour

    def __extract_fun_record(self, fun_data):
        fun_record_db = self.omdm.search_fun_record_by_fun_id(fun_data["id"])
        record_data = self.fprdms.dump(fun_record_db)
        return record_data

    def __make_function_list(
        self, pro_data, group_dict, fun_data, total_time, record_data
    ):
        if not fun_data["group2"]:
            fun_data["group2"] = ""
        data_dict = {
            "project_id": pro_data["id"],
            "project_nm": pro_data["project_nm"],
            "project_status": pro_data["status"],
            "group_id": pro_data.get("group_id", ""),
            "group_name": group_dict.get(pro_data["group_id"], ""),
            "function_id": fun_data["id"],
            "function_nm": fun_data["function_nm"],
            "function_status": fun_data["status"],
            "function_progress": fun_data["progress"],
            "expected_start_date": fun_data["expected_start_date"],
            # "start_time": fun_data["start_time"],
            "expected_end_date": fun_data["expected_end_date"],
            # "end_time": fun_data["end_time"],
            "group1": fun_data["group1"],
            "group2": fun_data["group2"],
            "total_working_hour": total_time,
            "last_update_content": record_data.get("progress_record", ""),
            "last_update_person": record_data.get("submitter", None),
            # "last_update_time": record_data.get("created_at", None),
        }
        start_time = fun_data["start_time"]
        if start_time:
            start_time = start_time.split(" ")[0]
        data_dict["start_time"] = start_time
        end_time = fun_data["end_time"]
        if end_time:
            end_time = end_time.split(" ")[0]
        data_dict["end_time"] = end_time
        last_update_time = record_data.get("created_at", "")
        if last_update_time:
            last_update_time = last_update_time.split(" ")[0]
        data_dict["last_update_time"] = last_update_time
        self.function_list.append(data_dict)

    def __make_data_list(self):
        self.data_list.append(self.function_list)

    def __get_member_project_list(self):
        pro_db, self.total = self.omdm.search_pro_data_by_developers(
            self.member, self.page, self.size
        )
        progress_record_data = self.omdm.search_fun_submit_record_data()
        group_data = self.opgm.obtain_project_group_data()
        group_dict = {data[0]: data[1] for data in group_data}
        record_data_list = [data[0] for data in progress_record_data]
        for pro_data_db in pro_db:
            pro_data = self.pdms.dump(pro_data_db)
            fun_db = self.omdm.search_fun_data_by_pro_id(self.member, pro_data["id"])
            self.function_list = []
            for fun_data_db in fun_db:
                fun_data = self.fdms.dump(fun_data_db)
                if fun_data.get("id") not in record_data_list:
                    total_time = self.__calc_total_working_hour(fun_data)
                else:
                    total_time = self.__submit_total_working_hour(
                        fun_data, progress_record_data
                    )
                record_data = self.__extract_fun_record(fun_data)
                self.__make_function_list(
                    pro_data, group_dict, fun_data, total_time, record_data
                )
            self.__make_data_list()

    def get_member_project(self):
        self.__get_member_project_list()
        return {
            "total_page": math.ceil(self.total / self.size),
            "total_count": self.total,
            "data_list": self.data_list,
        }
