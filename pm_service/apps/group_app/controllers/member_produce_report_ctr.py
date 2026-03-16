# -*- coding: utf-8 -*-
'''
@文件: member_produce_report_ctr.py
@說明:
@時間: 2025/04/07 16:37:36
@作者: LiDong
'''

import time
from functools import cached_property

import pymongo
import requests
from flask import current_app as app

from apps.group_app.models import OperMemberDataModel
from common.common_mongo import MongoDBHandler
from common.common_tools import CommonTools, timeit
from configs.constant import MONGO_CONFIG
from configs.db_config import db_config_dict
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProgressRecordDataModelSchema,
                                       ProjectDataModelSchema,
                                       TemporaryDutyModelSchema,
                                       TemporaryDutyRecordDataModelSchema)


class MemberProduceReportController:
    def __init__(self, payload, member) -> None:
        self.start_date = payload.get("start_date")
        self.end_date = payload.get("end_date")
        self.member = member
        self.omdm = OperMemberDataModel()
        self.pdms = ProjectDataModelSchema(only=["id", "project_nm"])
        self.fdms = FunctionDataModelSchema(only=["id", "function_nm", "progress"])
        self.fprdms = ProgressRecordDataModelSchema(
            only=["progress_record", "created_at", "time_consum", "path"]
        )
        self.tdms = TemporaryDutyModelSchema(only=["id", "duty_nm", "progress"])
        self.tdrdms = TemporaryDutyRecordDataModelSchema(
            only=["progress_record", "created_at", "time_consum", "path"]
        )

    @cached_property
    def mongo(self):
        mongodb = db_config_dict["mongodb"]
        host = mongodb["host"]
        port = mongodb["port"]
        db_name = mongodb["database_name"]
        mongo = MongoDBHandler(
            connection_string=f"mongodb://{host}:{port}/",
            db_name=db_name,
            logger=app.logger
        )
        return mongo

    def __define_date(self):
        if not self.start_date and not self.end_date:
            return ""
        if (self.start_date and not self.end_date) or (
            not self.start_date and self.end_date
        ):
            return "開始日期與結束日期需同時存在"
        start = time.strptime(self.start_date, "%Y-%m-%d")
        end = time.strptime(self.end_date, "%Y-%m-%d")
        if start > end:
            return "結束日期不可早於開始日期"
        return ""

    def __assemble_payload(self, cnt, fid_dict, rid_dict):
        fid_list = []
        for pro_data in cnt:
            pid = pro_data.pop("id")
            pro_data["project_id"] = pid
            for fun_data in fid_dict[pid]:
                fid = fun_data.pop("id")
                fid_list.append(fid)
                fun_data["progress_list"] = rid_dict[fid]
                fun_data["function_id"] = fid
                fun_data["_paths"] = []
                for record in rid_dict[fid]:
                    if record.get("path"):
                        fun_data["_paths"].append(record.pop("path"))
            pro_data["function_list"] = fid_dict[pid]
        return cnt, fid_list

    # def __get_img_urls(self, _path):
    #     file_info, flag = self.om.get_all_files_info_by_path(BUCKET, _path)
    #     if not flag:
    #         return {}, False
    #     file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
    #     return file_info_dic.get("files", []), True

    @timeit
    def __make_cnt_project(self, date_list):
        if not date_list:
            return [], []
        pro_fun_record_db = self.omdm.search_pro_fun_prog_data_by_record_submitter(
            self.member, date_list
        )
        if not pro_fun_record_db:
            return [], []
        fid_dict, rid_dict = dict(), dict()
        cnt_pro = []
        for pro_db, fun_db, record_db in pro_fun_record_db:
            pro_data, fun_data, record_data = (
                self.pdms.dump(pro_db),
                self.fdms.dump(fun_db),
                self.fprdms.dump(record_db),
            )
            fun_data["progress"] = f'{fun_data["progress"]}%'
            pid = pro_db.id
            fid = fun_db.id
            # urls, flag = self.__get_img_urls(record_data.pop("path"))
            # # if flag:
            # #     if "urls" in fun_data.keys():
            # #         fun_data["urls"] += urls
            # #     else:
            # #         fun_data["urls"] = urls
            # record_data["urls"] = urls
            if pid not in fid_dict:
                cnt_pro.append(pro_data)
                fid_dict[pid] = [fun_data]
            else:
                fid_dict[pid].append(fun_data)
            if fid not in rid_dict:
                rid_dict[fid] = [record_data]
            else:
                rid_dict[fid].append(record_data)
        cnt_pro, fid_list = self.__assemble_payload(cnt_pro, fid_dict, rid_dict)
        return cnt_pro, fid_list

    def __assemble_duty(self, cnt_duty, did_list, rid_dict):
        fid_list = []
        for fun_data in did_list:
            fid = fun_data.pop("id")
            fid_list.append(fid)
            fun_data["progress_list"] = rid_dict[fid]
            fun_data["function_id"] = fid
            fun_data["_paths"] = []
            for record in rid_dict[fid]:
                path = record.pop("path", "")
                if path:
                    fun_data["_paths"].append(path)
        cnt_duty["function_list"] = did_list
        return cnt_duty, fid_list

    @timeit
    def __make_cnt_duty(self, date_list):
        if not date_list:
            return [], []
        duty_record_db = self.omdm.search_duty_data_by_record_submitter(
            self.member, date_list
        )
        if not duty_record_db:
            return [], []
        did_list, rid_dict = [], dict()
        cnt_duty = {"project_id": "臨時任務", "project_nm": "臨時任務"}
        for duty_db, record_db in duty_record_db:
            duty_data = self.tdms.dump(duty_db)
            record_data = self.tdrdms.dump(record_db)
            duty_data["function_nm"] = duty_data.pop("duty_nm")
            duty_data["progress"] = f'{duty_data["progress"]}%'
            did = duty_db.id
            did_list.append(duty_data)
            if did not in rid_dict:
                rid_dict[did] = [record_data]
            else:
                rid_dict[did].append(record_data)
        cnt_duty, fid_list = self.__assemble_duty(cnt_duty, did_list, rid_dict)
        return cnt_duty, fid_list

    @timeit
    def __post_webapi_to_trans_cnt(self, cnt):
        url = "http://10.126.1.238:9596/api/daily_doc"
        headers = {
            "accept": "application/json",
            "cnt-Type": "application/json",
        }
        response = requests.post(url, headers=headers, json=cnt)
        return response.json()

    @timeit
    def __add_total_time_consum(self, cnts):
        for cnt in cnts:
            total_time_consum = 0
            for func in cnt["function_list"]:
                total_time_consum += func["time_consum"]
            cnt["total_time_consum"] = total_time_consum
        return cnts

    def __produce_member_report_prog(self, date_list):
        cnt, fid_list = self.__make_cnt_project(date_list)
        cnt_duty, did_list = self.__make_cnt_duty(date_list)
        if cnt_duty:
            cnt.append(cnt_duty)
        if not cnt:
            return [], [], []
        cnt = self.__post_webapi_to_trans_cnt(cnt)
        cnt = self.__add_total_time_consum(cnt)
        return cnt, fid_list, did_list

    # def __get_participated_projects(self, fid_list):
    #     pro_fun_db = self.omdm.search_pro_fun_data_by_user_id(self.member)
    #     if not pro_fun_db:
    #         return []
    #     fid_dict = dict()
    #     for pro_db, fun_db in pro_fun_db:
    #         fun_data = self.fdms.dump(fun_db)
    #         pid = pro_db.id
    #         if pid not in fid_list:
    #             fun_data["pro_nm"] = pro_db.project_nm
    #             if pid not in fid_dict:
    #                 fid_dict[pid] = [fun_data]
    #             elif pid in fid_dict:
    #                 fid_dict[pid].append(fun_data)
    #     cnt_pro = []
    #     for pid, fun_data_list in fid_dict.items():
    #         cnt = ""
    #         for idx, fun_data in enumerate(fun_data_list):
    #             cnt += f'{idx+1}. {fun_data["function_nm"]} {fun_data["progress"]}%：無進度\n'
    #         cnt_pro.append(
    #             {
    #                 "content": cnt,
    #                 "project_nm": fun_data_list[0]["pro_nm"],
    #                 "total_time_consum": 0,
    #             }
    #         )
    #     return cnt_pro

    # def __get_participated_duty(self, did_list):
    #     duty_db_list = self.omdm.search_duty_data_by_user_id(self.member)
    #     if not duty_db_list:
    #         return []
    #     did_dict = dict()
    #     for duty_db in duty_db_list:
    #         fun_data = self.tdms.dump(duty_db)
    #         did = duty_db.id
    #         if did not in did_list:
    #             if did not in did_dict:
    #                 did_dict[did] = [fun_data]
    #             elif did in did_dict:
    #                 did_dict[did].append(fun_data)
    #     cnt_duty = []
    #     for did, duty_data_list in did_dict.items():
    #         cnt = ""
    #         for idx, duty_data in enumerate(duty_data_list):
    #             cnt += f'{idx+1}. {duty_data["duty_nm"]} {duty_data["progress"]}%：無進度\n'
    #         cnt_duty.append(
    #             {
    #                 "content": cnt,
    #                 "project_nm": "臨時任務",
    #                 "total_time_consum": 0,
    #             }
    #         )
    #     return cnt_duty

    # def __get_all_participated_projects(self, fid_list, did_list):
        # cnt_pro = self.__get_participated_projects(fid_list)
        # cnt_duty = self.__get_participated_duty(did_list)
        # return cnt_pro + cnt_duty

    def __format_project(self, project_list):
        project_dict = {}
        for project in project_list:
            project_id = project["project_id"]
            total_time_consum = project["total_time_consum"]
            function_list = project.pop("function_list")
            if project_id not in project_dict.keys():
                project_dict[project_id] = project
                function_dict = {}
                for function in function_list:
                    function_id = function["function_id"]
                    function_dict[function_id] = function
                project["function_dict"] = function_dict
            else:
                old_project = project_dict[project_id]
                old_project["total_time_consum"] += total_time_consum
                self.__format_function(old_project)
        return project_dict

    def __format_function(self, old_project):
        function_dict = old_project["function_dict"]
        for function in function_dict.values():
            function_id = function["function_id"]
            if function_id not in function_dict.keys():
                function_dict[function_id] = function
            else:
                old_function = function_dict[function_id]
                time_consum = function["time_consum"]
                function_progress = function["function_progress"]
                progress_record = function["progress_record"]
                _paths = function["_paths"]
                old_function["time_consum"] += time_consum
                old_function["progress_record"] += progress_record
                old_function["_paths"] += _paths
                old_function["function_progress"] = max(
                    old_function["function_progress"],
                    function_progress
                )

    def __format_result(self, project_dict):
        result = []
        for _, project in project_dict.items():
            function_list = []
            function_dict = project.pop("function_dict")
            for _, function in function_dict.items():
                function["_paths"] = list(set(function["_paths"]))
                function_list.append(function)
            project["function_list"] = function_list
            result.append(project)
        return result

    def __get_report_from_mongo(self):
        collection = MONGO_CONFIG["COLLECTION"]
        all_data = self.mongo.find_many(
            collection,
            {
                "work_no": self.member,
                "date": {"$gte": self.start_date, "$lte": self.end_date}
            },
            sort_by=[("date", pymongo.ASCENDING)],
            filters={
                "_id": 0,
                "username": 0,
                "dep_nm": 0,
                "created_at": 0,
                "updated_at": 0,
                "work_no": 0
            }
        )
        date_list = []
        project_list = []
        for data in all_data:
            date_list.append(data.pop("date"))
            project_list += data["content"]
        return project_list, date_list

    def __cal_date(self, filters):
        datelist = CommonTools.generate_date_list(
            self.start_date, self.end_date
        )
        return [i for i in datelist if i not in filters]

    def produce_member_report(self):
        result = self.__define_date()
        if result:
            return result, False
        # 從mongodb中查詢數據，過濾mongo中有消息的日期，從db中查詢剩餘日期的數據
        if self.start_date != self.end_date or CommonTools.get_now("date") !=self.start_date:
            mongo_cnt, date_list = self.__get_report_from_mongo()
            date_list = self.__cal_date(date_list)
        else:
            date_list = [self.start_date]
            mongo_cnt = []
        cnt, _, _ = self.__produce_member_report_prog(date_list)
        project_dict = self.__format_project(mongo_cnt + cnt)
        prog_cnt = self.__format_result(project_dict)
        # noprog_cnt = self.__get_all_participated_projects(fid_list, did_list)
        return {
            "start_date": self.start_date,
            "end_date": self.end_date,
            "content": prog_cnt,
        }, True
