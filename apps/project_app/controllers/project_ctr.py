# -*- coding: utf-8 -*-
"""
@文件: project_ctr.py
@說明:
@時間: 2024/07/19 15:07:39
@作者: LiDong
"""

import math
import time
from datetime import datetime
from functools import cached_property

from apps.project_app.controllers.delete_project_ctr import \
    DeleteProjectController
from apps.project_app.controllers.pro_common import get_total_page
from apps.project_app.models import (OperFunctionDataModel,
                                     OperProgressRecordDataModel,
                                     OperProjectApplyRecordModel,
                                     OperProjectDataModel,
                                     OperProjectGroupModel,
                                     OperRecordFormModel,
                                     OperReviewRecordFormModel)
from common.common_minio import OperMinio
from common.common_tools import CommonTools, get_empid_department_info, get_now
from configs.const_conf import ENV, send_message_link
from configs.constant import BUCKET
from configs.senddingplus import SendMessageNotice
from dbs.mysql_db import DBFunction
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       OperRecordModelSchema,
                                       ProjectApplyRecordModelSchema,
                                       ProjectDataModelSchema,
                                       ReviewRecordModelSchema)


class ProjectFinishController:
    def __init__(self) -> None:
        self.OPPM = OperProjectDataModel()
        self.ProjectSchema = ProjectDataModelSchema()
        self.oparm = OperProjectApplyRecordModel()
        self.oparms = ProjectApplyRecordModelSchema()

    def __format_apply_data(self, project_id, empid, product_pm, data):
        apply_data = {
            "project_id": project_id,
            "apply_type": "完結專案",
            "submitter": empid,
            "reviewer": product_pm,
            "priority": data.priority,
        }
        return apply_data

    def __update_project_status(self, project_id, status=6):
        update_data = {
            "status": status,
            "status_update_at": get_now(),
            "end_time": get_now(),
        }
        return self.OPPM.update_data_by_id(project_id, update_data)

    def __send_notice_to_pm(self, empid, product_pm, serialize_data):
        content = get_empid_department_info(empid)
        product_pm = product_pm.split(";")
        link = f"{send_message_link[ENV]}approal"
        message = f"您好，{content['chnname']}提交了關於({serialize_data['project_nm']})專案的完結申請，請及時處理，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, product_pm)

    def finish_project(self, empid, project_id):
        # 获取所有功能
        func_data = self.OPPM.search_by_function(project_id)
        if len(func_data) != 0:
            return "任務沒有全部完成", False
        data = self.OPPM.search_data_by_pid(project_id)
        serialize_data = self.ProjectSchema.dump(data)
        project_pm = serialize_data.get("project_pm", "")
        if empid != project_pm:
            return "不具備完結專案權限", False
        status = serialize_data.get("status", "")
        if status != 5:
            return "專案狀態不是進行中", False
        product_pm = serialize_data.get("product_pm", "")
        if project_pm != product_pm and project_pm != "":
            # 專案PM與產品PM不是同一個人，需要進行審批
            data = self.__format_apply_data(project_id, empid, product_pm, data)
            obj = self.oparms.load(data)
            result, flag = self.oparm.add_data_to_db(obj)
            if flag:
                result, flag = self.__update_project_status(project_id)
            result, flag = DBFunction.do_commit(result, flag)
            if flag:
                self.__send_notice_to_pm(empid, product_pm, serialize_data)
                return "申請已提交", flag
            return result, flag
        result, flag = self.__update_project_status(project_id, 7)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            return "專案已完結", flag
        return result, flag


class ProjectRestartController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()

    def restart_project(self, user_id, project_id):
        query, project_db = self.opdm.search_delete_finish_data_by_pid(
            user_id, project_id
        )
        if not project_db:
            return "無此權限", False
        result, flag = self.opdm.update_status_by_query(query)
        return DBFunction.do_commit(result, flag)


class SetStatusController:

    def __delete(self, user_id, project_id):
        dpc = DeleteProjectController(project_id, user_id)
        return dpc.process_delete_project()

    def __restart(self, user_id, project_id):
        return ProjectRestartController().restart_project(user_id, project_id)

    def __finish(self, user_id, project_id):
        return ProjectFinishController().finish_project(user_id, project_id)

    def __pause(self, user_id, project_id):
        opdm = OperProjectDataModel()
        data = opdm.search_pause_by_pid(user_id, project_id)
        if not data:
            return "無此權限", False
        data.last_status = data.status
        data.status = 8
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("專案已暫停", True)

    def __restore(self, user_id, project_id):
        opdm = OperProjectDataModel()
        data = opdm.search_pause_by_pid(user_id, project_id, [8])
        if not data:
            return "無此權限", False
        data.status = data.last_status
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("專案已恢復", True)

    def run(self, user_id, project_id, payload):
        status = payload.get("status")
        if status == 0:
            return self.__delete(user_id, project_id)
        elif status == 5:
            return self.__restart(user_id, project_id)
        elif status == 7:
            return self.__finish(user_id, project_id)
        elif status == 8:
            return self.__pause(user_id, project_id)
        elif status == 9:
            return self.__restore(user_id, project_id)
        return "狀態碼錯誤", False


class ProjectProgressAndHourController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.opfm = OperFunctionDataModel()
        self.oprd = OperProgressRecordDataModel()

    def __get_fun_datas(self, project_id):
        select_cols_fun = ["progress", "developers", "start_time", "end_time"]
        fdms = FunctionDataModelSchema(many=True, dump_only=select_cols_fun)
        fun_data = self.opfm.search_fun_data_by_pid(project_id)
        fun_datas = fdms.dump(fun_data)
        return fun_datas

    def __calculate_time_difference_in_hours(self, start_time, end_time):
        result = 0
        if start_time is None and end_time is None:
            return result
        elif end_time is not None:
            time_limit = datetime.strptime("12:00:00", "%H:%M:%S").time()
            start_time = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
            end_time = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            time_interval = end_time - start_time
            start_week = start_time.isocalendar()[1]
            end_week = end_time.isocalendar()[1]
            week_num = end_week - start_week
            if start_time.time() <= time_limit and end_time.time() > time_limit:
                result = time_interval.days * 8 + (time_interval.seconds / 3600 - 1.5)
            else:
                result = time_interval.days * 8 + time_interval.seconds / 3600
            result = float(round(result, 2)) - week_num * 2 * 8
        return result

    def __get_total_working_hour(self, fun_datas):
        total_working_hour = 0
        submit_hour = 0
        submit_fid = []
        fid_list = [data["id"] for data in fun_datas]
        if len(fid_list) > 0:
            submit_data = self.oprd.serach_data_by_fid(fid_list)
            submit_hour = sum(float(data[0]) for data in submit_data)
            submit_fid = list(set([data[1] for data in submit_data]))
        missing_list = [fid for fid in fid_list if fid not in submit_fid]
        if len(missing_list) > 0:
            total_working_hour = sum(
                self.__calculate_time_difference_in_hours(
                    data["start_time"], data["end_time"]
                )
                for data in fun_datas
                if data["id"] in missing_list
            )
        return submit_hour + total_working_hour

    def _get_progress(self, fun_datas):
        progress_sum = sum(data["progress"] for data in fun_datas)
        if len(fun_datas) == 0:
            return 0
        pro_progress = round(progress_sum / len(fun_datas), 2)
        return pro_progress

    def run(self, project_id):
        fun_datas = self.__get_fun_datas(project_id)
        progress = self._get_progress(fun_datas)
        total_working_hour = self.__get_total_working_hour(fun_datas)
        return {
            "progress": progress,
            "total_working_hour": total_working_hour
        }


class ProjectFileNumController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()

    def get_file_num(self, project_id):
        project_obj = self.opdm.search_data_by_id(project_id)
        file_path = project_obj.path
        oper_minio = OperMinio()
        file_num, result = oper_minio.calculate_files_count(BUCKET, file_path)
        if not result:
            file_num = 0
        return file_num


class ProjectDetailsController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.opgm = OperProjectGroupModel()

    def get_project_details(self, project_id):
        prodata_dict = self.__get_project_datas(project_id)
        if not prodata_dict:
            return "專案不存在", False
        self.__obtain_group_name(prodata_dict)
        fun_developer_list = self.__get_developers(prodata_dict)
        participants_num, participant = self.__get_participants_num(
            prodata_dict, fun_developer_list
        )
        self.__get_data_dict(prodata_dict, participants_num, participant)
        return prodata_dict, True

    def __obtain_group_name(self, prodata_dict):
        group_data = self.opgm.obtain_project_group_data_by_pid(
            prodata_dict["group_id"]
        )
        if group_data:
            prodata_dict["group_name"] = group_data.group_name
        else:
            prodata_dict["group_name"] = ""

    def __get_project_datas(self, project_id):
        select_cols_pro = [
            "id",
            "reserved1",
            "reserved2",
            "updated_at",
            "end_time",
            "status_update_at",
        ]
        pdms = ProjectDataModelSchema(exclude=select_cols_pro)
        project_data = self.opdm.search_project_data_by_pid(project_id)
        prodata_dict = pdms.dump(project_data)
        return prodata_dict

    def __get_developers(self, project_data):
        developer_list = list()
        developers = project_data["developers"]
        if developers:
            developer_list = developers.split(";")
        return list(set(developer_list))

    def __get_participants_num(self, prodata_dict, fun_developer_list):
        creator = prodata_dict.get("creator", "").split(";")
        product_pm = prodata_dict.get("product_pm", "").split(";")
        project_pm = prodata_dict.get("project_pm", "").split(";")
        participate = list(
            set(creator + product_pm + project_pm + fun_developer_list)
        )
        participate = [item for item in participate if item != ""]
        return len(participate), participate

    def __get_data_dict(self, prodata_dict, participants_num, participant):
        prodata_dict["participant_num"] = participants_num
        prodata_dict["participant"] = participant


class ProjectListController:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.ofdm = OperFunctionDataModel()
        self.opgm = OperProjectGroupModel()

    @cached_property
    def pro_data_schems(self):
        dump_fields = [
            "id",
            "project_nm",
            "creator",
            "project_pm",
            "product_pm",
            "expected_end_date",
            "status",
            "priority",
            "end_time",
            "group_id",
            "created_at"
        ]
        pdms = ProjectDataModelSchema(many=True, only=dump_fields)
        return pdms

    def get_group_mem(self, empid):
        url = "http://10.126.1.237:13570/api/searchSubordinates"
        data = {"empid": empid}
        for _ in range(3):
            result, flag = CommonTools.send_get_request(url, data=data)
            if flag:
                empid_list = [empid]
                for k in result["content"].keys():
                    empid_list.append(k)
                return empid_list, flag
            time.sleep(1)
        return f"{url}: {result}, 查詢下屬成員失敗", flag

    def __search_function(self, pro_id_list):
        result_dict = dict()
        datalist = self.ofdm.search_data_by_pro_id_list(pro_id_list)
        func_list = FunctionDataModelSchema(many=True).dump(datalist)
        for func in func_list:
            pro_id = func["project_id"]
            status = func["status"]
            if status == 0:
                continue
            developers = func["developers"]
            if not developers:
                developers = list()
            else:
                developers = developers.split(";")
            progress = float(func["progress"])
            if pro_id not in result_dict.keys():
                func_dict = dict()
                func_dict["participant_num"] = list(set(developers))
                func_dict["all_t_num"] = 1
                remain_t_num = 0
                if status in [1, 2, 4]:
                    remain_t_num += 1
                func_dict["remain_t_num"] = remain_t_num
                func_dict["progress"] = progress
                result_dict[pro_id] = func_dict
            else:
                fucn_dict = result_dict[pro_id]
                fucn_dict["all_t_num"] += 1
                fucn_dict["progress"] += progress
                fucn_dict["participant_num"] = list(
                    set(fucn_dict["participant_num"] + developers)
                )
                if status in [1, 2, 4]:
                    fucn_dict["remain_t_num"] += 1
        return result_dict

    def __format_func_data(self, datalist, result_dict):
        group_data = self.opgm.obtain_project_group_data()
        group_dict = {data[0]: data[1] for data in group_data}
        for data in datalist:
            pro_id = data["id"]
            creator = data.pop("creator").split(";")
            product_pm = data.get("product_pm").split(";")
            project_pm = data.get("project_pm").split(";")
            func_dict = result_dict.get(pro_id, dict())
            data["remain_t_num"] = func_dict.get("remain_t_num", 0)
            data["all_t_num"] = func_dict.get("all_t_num", 0)
            if data["all_t_num"] > 0:
                data["progress"] = round(
                    func_dict.get("progress", 0) / data["all_t_num"], 2
                )
            else:
                data["progress"] = 0
            developers = func_dict.get("participant_num", list())
            data["developers"] = developers
            data["participant_num"] = len(
                list(set(developers + creator + product_pm + project_pm))
            )
            data["group_name"] = group_dict.get(data["group_id"], "")

    def search_project_list(self, empid, payload):
        # 判斷登錄者的身份
        result, flag = self.get_group_mem(empid)
        if not flag:
            return result, flag
        datalist, total_count = self.opdm.search_data_list(result, **payload)
        datalist = self.pro_data_schems.dump(datalist)
        pro_id_list = [data["id"] for data in datalist]
        if not pro_id_list:
            return {
                "total_page": 0,
                "total_count": 0,
                "project_list": datalist
            }, True
        result_dict = self.__search_function(pro_id_list)
        self.__format_func_data(datalist, result_dict)
        total_page = get_total_page(payload.get("size", 10), total_count)
        return {
            "total_page": total_page,
            "total_count": total_count,
            "project_list": datalist,
        }, True


class ProjectTaskListController:
    def __init__(self) -> None:
        self.OPPM = OperProjectDataModel()
        self.OPFM = OperFunctionDataModel()
        self.pdms = ProjectDataModelSchema(only=["creator", "product_pm", "project_pm"])

    def check_if_exists(self, project_id):
        data = self.OPPM.search_data_by_id(project_id)
        if data:
            data = self.pdms.dump(data)
            id_list = list(
                set([data["creator"], data["product_pm"], data["project_pm"]])
            )
            return id_list, True
        return "", False

    @cached_property
    def func_data_schema(self):
        dump_fields = [
            "project_id",
            "path",
            "status_update_at",
            "reserved1",
            "reserved2",
            "updated_at",
            "created_at",
        ]
        fdms = FunctionDataModelSchema(exclude=dump_fields, many=True)
        return fdms

    def __handle_fun_data(self, data):
        developers = data.get("developers")
        if not developers:
            data["developers"] = list()
        else:
            data["developers"] = developers.split(";")
        start_time = data.get("start_time", "")
        if start_time:
            data["start_time"] = start_time.split(" ")[0]
        end_time = data.get("end_time", "")
        if end_time:
            data["end_time"] = end_time.split(" ")[0]
        if not data["group2"]:
            data["group2"] = ""

    def search_project_task_list(self, payload, project_id, empid):
        id_list, flag = self.check_if_exists(project_id)
        if not flag:
            return f"{project_id}: 該ID不存在!", False
        datalist, count = self.OPFM.search_data_list(
            project_id, empid, id_list, **payload
        )
        if not datalist:
            return {
                "total_page": 0,
                "total_count": 0,
                "data_list": datalist
            }, True
        datalist = self.func_data_schema.dump(datalist)
        for data in datalist:
            self.__handle_fun_data(data)
        total_page = get_total_page(payload.get("size", 10), count)
        return {
            "total_page": total_page,
            "total_count": count,
            "data_list": datalist,
        }, True


class ProjectFunctionListController:
    def __init__(self) -> None:
        self.ofdm = OperFunctionDataModel()
        self.opdm = OperProjectDataModel()

    def search_projects_n_funs(self, payload, empid):
        page_num, count, status = self.__get_pram(payload)
        result_list = self.__get_datalists(page_num, count, status, empid)
        total_count = self.opdm.search_project_count_by_status(status, empid)
        total_page = get_total_page(count, total_count)
        return {
            "total_page": total_page,
            "total_count": total_count,
            "data_list": result_list,
        }

    def __get_pram(self, payload):
        page_num = payload.get("page", 1)
        count = payload.get("size", 10)
        status = payload.get("status")
        return page_num, count, status

    def __get_datalists(self, page_num, count, status, empid):
        pro_id_list = self.opdm.search_pro_id(page_num, count, status, empid)
        pro_id_list = [i[0] for i in pro_id_list if i]
        data_list = self.opdm.search_projects_by_status(status, empid, pro_id_list)
        project_datas = self.__format_project_data(data_list)
        result_list = list()
        for project_data in project_datas:
            if project_data not in result_list:
                result_list.append(project_data)
        func_datas = self.__format_func_data(data_list)
        for data in result_list:
            project_id = data.pop("id")
            data["project_id"] = project_id
            data["task_num"] = 0
            for func_data in func_datas:
                if func_data.get("project_id", "") == project_id:
                    func_id = func_data.pop("id")
                    func_data["function_id"] = func_id
                    data["task_num"] += 1
        return result_list

    def __format_project_data(self, data_list):
        select_cols_pro = ["id", "project_nm", "status"]
        pdms = ProjectDataModelSchema(many=True, only=select_cols_pro)
        project_datas = pdms.dump([i[0] for i in data_list if i])
        return project_datas

    def __format_func_data(self, data_list):
        select_cols_pro = [
            "id",
            "function_nm",
            "expected_start_date",
            "expected_end_date",
            "start_time",
            "end_time",
            "developers",
            "priority",
            "progress",
            "project_id",
        ]
        pdms = FunctionDataModelSchema(many=True, only=select_cols_pro)
        func_datas = pdms.dump([i[1] for i in data_list if i])
        return func_datas


class ProjectReviewListController:
    def __init__(self) -> None:
        self.OPRM = OperProjectApplyRecordModel()
        self.OPPM = OperProjectDataModel()
        self.OPFM = OperFunctionDataModel()

    @cached_property
    def pro_apply_record_schema(self):
        dump_fields = [
            "id",
            "project_id",
            "function_id",
            "submitter",
            "apply_type",
            "created_at",
            "priority",
        ]
        prrms = ProjectApplyRecordModelSchema(only=dump_fields)
        return prrms

    def get_apply_record(self, payload, empid):
        page = payload.get("page", 1)
        size = payload.get("size", 10)
        project_list = list()
        result = self.OPRM.get_project_apply_record(empid, page, size)
        record_list, total_count = result
        for record in record_list:
            project_list = self.__handle_apply_record_data(record, project_list)
        content = {
            "total_page": math.ceil(total_count / size),
            "total_count": total_count,
            "data_list": project_list,
        }
        return content

    def __handle_apply_record_data(self, record, project_list):
        record_data = self.pro_apply_record_schema.dump(record[0])
        review_id = record_data.pop("id")
        record_data["review_id"] = review_id
        record_data["project_nm"] = record.project_nm
        func_id = record_data["function_id"]
        record_data["function_nm"] = ""
        if func_id:
            function_nm = self.OPFM.search_func_nm_n_priority_by_id(func_id)[0]
            record_data["function_nm"] = function_nm
        project_list.append(record_data)
        project_list = sorted(project_list, key=lambda x: x["priority"], reverse=True)
        return project_list


class ProjectReviewIdController:
    def __init__(self) -> None:
        self.OPPM = OperProjectDataModel()
        self.ORRFM = OperReviewRecordFormModel()
        self.oparm = OperProjectApplyRecordModel()
        self.rrms = ReviewRecordModelSchema()
        self.OFDM = OperFunctionDataModel()
        self.fdms = FunctionDataModelSchema()
        self.parms = ProjectApplyRecordModelSchema()

    def __get_apply_record(self, review_id):
        data = self.oparm.search_data_by_review_id(review_id)
        apply_record = ProjectApplyRecordModelSchema().dump(data)
        return apply_record

    def __get_all_review_result(self, review_id):
        datalist = self.ORRFM.search_result_by_review_id(review_id)
        datalist = self.rrms.dump(datalist, many=True)
        return datalist

    def __get_result(self, result_list):
        result = 1
        for r in result_list:
            if int(r["result"]) != 1:
                result = int(r["result"])
                break
        return result

    def __get_apply_status(self, review_result):
        if review_result == 1:
            apply_status = 3
        else:
            apply_status = 0
        return apply_status

    def __get_pro_status(self, review_result, apply_type):
        project_status = 0
        if apply_type == "創建專案":
            if review_result == 1:
                project_status = 3
            else:
                project_status = 1
        elif apply_type == "規劃審核":
            if review_result == 1:
                project_status = 5
            else:
                project_status = 3
        elif apply_type == "完結專案":
            if review_result == 1:
                project_status = 7
            else:
                project_status = 5
        return project_status

    def __get_func_status(self, review_result, apply_type):
        function_status = 0
        if apply_type == "完結功能":
            if review_result == 1:
                function_status = 3
            else:
                function_status = 2
        elif apply_type == "創建功能":
            if review_result == 1:
                function_status = 1
            else:
                function_status = 0
        return function_status

    def __search_data_from_db(self, review_id):
        record_data = self.oparm.search_data_by_review_id(review_id)
        pro_data = self.OPPM.serach_data_by_review_id(review_id)
        if record_data.function_id:
            project_id, function_id = record_data.project_id, record_data.function_id
            fun_data = self.OFDM.search_fun_data_by_fid(project_id, function_id)
        else:
            fun_data = self.OFDM.search_data_by_pid(pro_data.id)
            fun_data = self.fdms.dump(fun_data, many=True)
        return pro_data, fun_data

    def __send_notice_when_pro_adopt(self, pro_data, link, pm_ids, analysis_ids):
        message = f"您好，您的專案({pro_data.project_nm})的立案申請已通過審批! [点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, pm_ids)
        message = f"您好，您的專案({pro_data.project_nm})的立案申請已通過審批，請您及時上傳資料與分配任務，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, analysis_ids)

    def __send_notice_when_plan_adopt(
        self, pm_ids, analysis_ids, fun_data, pro_data, link
    ):
        ids = list(set(pm_ids + analysis_ids))
        developer_ids = []
        for fdata in fun_data:
            if fdata.get("developers"):
                developers = fdata.get("developers").split(";")
                developer_ids += developers
        developer_ids = list(set(developer_ids))
        message = f"您好，您的專案({pro_data.project_nm})架構及任務排程申請已通過審批，請按計劃進行開發，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, ids)
        if len(developer_ids) > 0:
            message = f"您好，({pro_data.project_nm})專案的架構及任務排程申請已通過審批，請及時更新相關任務進度，[点击查看]({link})。"
            SendMessageNotice.send_single_markdown(message, developer_ids)

    def __send_notice_when_fun_create_adopt(self, pro_data, fun_data, link):
        if fun_data:
            if fun_data.developers:
                developers = fun_data.developers.split(";")
                message = f"您好，({pro_data.project_nm})新增任務({fun_data.function_nm})已通過審批，請按計劃進行開發，[点击查看]({link})。"
                SendMessageNotice.send_single_markdown(message, developers)

    def __send_notice_when_fun_finish_adopt(
        self, pro_data, fun_data, pm_ids, link, apply_record
    ):
        message = f"您好，({pro_data.project_nm})專案中的({fun_data.function_nm})已完成，請查閱，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, pm_ids)
        message = f"您好，您的開發任務({pro_data.project_nm}-{fun_data.function_nm})完結申請已通過審批，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, apply_record["submitter"])

    def __send_notice_when_pro_finish_adopt(self, pro_data, analysis_ids, link):
        creator = [pro_data.creator]
        ids = list(set(analysis_ids + creator))
        message = (
            f"您好，({pro_data.project_nm})專案完結申請已通過審批，[点击查看]({link})。"
        )
        SendMessageNotice.send_single_markdown(message, ids)

    def __send_message_to_responsible(self, review_id, apply_record):
        apply_type = apply_record["apply_type"]
        pro_data, fun_data = self.__search_data_from_db(review_id)
        pm_ids = list(set([pro_data.product_pm, pro_data.creator]))
        analysis_ids = pro_data.project_pm.split(";")
        link = f"{send_message_link[ENV]}projects/{pro_data.id}"
        if apply_type == "創建專案":
            self.__send_notice_when_pro_adopt(pro_data, link, pm_ids, analysis_ids)
        elif apply_type == "規劃審核":
            self.__send_notice_when_plan_adopt(
                pm_ids, analysis_ids, fun_data, pro_data, link
            )
        elif apply_type == "創建功能":
            self.__send_notice_when_fun_create_adopt(pro_data, fun_data, link)
        elif apply_type == "完結功能":
            self.__send_notice_when_fun_finish_adopt(
                pro_data, fun_data, pm_ids, link, apply_record
            )
        elif apply_type == "完結專案":
            self.__send_notice_when_pro_finish_adopt(pro_data, analysis_ids, link)

    def approval_review(self, payload, review_id, empid):
        payload["apply_id"] = review_id
        payload["reviewer"] = empid
        apply_record = self.__get_apply_record(review_id)
        if not apply_record:
            return "review_id 不存在", False
        reviewer_list = apply_record.get("reviewer", "").split(";")
        result_list = self.__get_all_review_result(review_id)
        result_list.append(payload)
        review_result = 1
        result = ""
        flag = True
        if len(result_list) == len(reviewer_list):
            review_result = self.__get_result(result_list)
            apply_status = self.__get_apply_status(review_result)
            apply_type = apply_record["apply_type"]
            pro_status = self.__get_pro_status(review_result, apply_type)
            func_status = self.__get_func_status(review_result, apply_type)
            if pro_status != 0:
                opdm = OperProjectDataModel()
                result, flag = opdm.update_status(pro_status, review_id)
            # if func_status != 0:
            ofdm = OperFunctionDataModel()
            result, flag = ofdm.update_status(func_status, review_id)
            if flag:
                oparm = OperProjectApplyRecordModel()
                result, flag = oparm.update_status(apply_status, review_id)
        if flag:
            obj = self.rrms.load(payload)
            result, flag = self.ORRFM.add_data_to_db(obj)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            if len(result_list) == len(reviewer_list):
                self.__send_message_to_responsible(review_id, apply_record)
        return result, flag


class ProjectGanttChartController:
    def __init__(self) -> None:
        self.OPFM = OperFunctionDataModel()

    def __handle_gantt_chart_data(self, gantt_data):
        developers = gantt_data.get("developers")
        if not developers:
            developers = ""
        if not gantt_data["group2"]:
            gantt_data["group2"] = ""
        return {
            "id": gantt_data["id"],
            "function_nm": gantt_data["function_nm"],
            "describe": gantt_data["describe"],
            "progress": gantt_data["progress"],
            "expected_start_date": gantt_data["expected_start_date"],
            "expected_end_date": gantt_data["expected_end_date"],
            "latest_expected_end_date": gantt_data["latest_expected_end_date"],
            "revision_count": gantt_data["revision_count"],
            "start_date": gantt_data["start_time"],
            "end_date": gantt_data["end_time"],
            "developers": developers.split(";"),
            "group1": gantt_data["group1"],
            "group2": gantt_data["group2"],
        }

    def gantt_chart(self, project_id):
        gantt_data = self.OPFM.search_data_by_pid(project_id)
        gantt_data_list = FunctionDataModelSchema(many=True).dump(gantt_data)
        gantt_chart_list = list()
        for gantt_data in gantt_data_list:
            start_time = gantt_data.get("start_time", "")
            if start_time:
                gantt_data["start_time"] = start_time.split(" ")[0]
            end_time = gantt_data.get("end_time", "")
            if end_time:
                gantt_data["end_time"] = end_time.split(" ")[0]
            gantt_chart_list.append(self.__handle_gantt_chart_data(gantt_data))
        return gantt_chart_list


class ProjectMemberDynamicsController:
    def __init__(self) -> None:
        self.ORF = OperRecordFormModel()
        self.OPFM = OperFunctionDataModel()

    def __search_data_by_id(self, id):
        self.dump_fields = [
            "operator",
            "matter",
            "matter_id",
            "created_at",
        ]
        self.rrms = OperRecordModelSchema(only=self.dump_fields, many=True)
        datalist = self.ORF.search_data_by_project_id(id)
        member_dynamics_data = self.rrms.dump(datalist)
        return member_dynamics_data

    def __get_operator_data(self, operator):
        return get_empid_department_info(operator) if operator else None

    def __handle_member_dynamics_data(self, member_dynamics):
        operator_data = self.__get_operator_data(member_dynamics["operator"])
        operator = operator_data.get("chname") if operator_data else ""
        return {
            "operator": operator,
            "matter": member_dynamics["matter"],
            "created_at": member_dynamics["created_at"],
        }

    def __get_function_id(self, project_id):
        self.dump_fields = ["id"]
        self.fdms = FunctionDataModelSchema(only=self.dump_fields, many=True)
        datalist = self.OPFM.search_data_by_pid(project_id)
        function_id_list = self.fdms.dump(datalist)
        return function_id_list

    def __search_data_by_function_id(self, project_id):
        function_id_list = self.__get_function_id(project_id)
        data_list = []
        for function_id in function_id_list:
            member_dynamics_data = self.__search_data_by_id(function_id["id"])
            member_dynamics_list = [
                self.__handle_member_dynamics_data(member_dynamics)
                for member_dynamics in member_dynamics_data
            ]
            data_list += member_dynamics_list
        return data_list

    def member_dynamics(self, project_id, payload):
        page = payload.get("page")
        size = payload.get("size", 5)
        member_dynamics_data = self.__search_data_by_id(project_id)
        member_dynamics_list = [
            self.__handle_member_dynamics_data(member_dynamics)
            for member_dynamics in member_dynamics_data
        ]
        data_list = self.__search_data_by_function_id(project_id)
        member_dynamics_list += data_list
        member_dynamics_list = sorted(
            member_dynamics_list,
            key=lambda x: x["created_at"],
            reverse=True,
        )
        return member_dynamics_list[(page - 1) * size : page * size]


class ProjectFilesController:
    def __init__(self) -> None:
        self.OPDM = OperProjectDataModel()
        self.minio = OperMinio()

    def __obtain_file_messages(self, project_data):
        file_path = project_data["path"]
        datalist_dic = {}
        if file_path:
            file_info, flag = self.minio.get_all_files_info_by_path(BUCKET, file_path)
            if not flag:
                return datalist_dic
            file_info_dic = CommonTools.convert_file_info_to_dict(file_info)
            datalist_dic["files"] = file_info_dic.get("files", [])
            datalist_dic["images"] = file_info_dic.get("images", [])
            datalist_dic["videos"] = file_info_dic.get("videos", [])
            datalist_dic["architecture_diagram"] = file_info_dic.get(
                "architecture_diagram", []
            )
            datalist_dic["flowchart"] = file_info_dic.get("flowchart", [])
            datalist_dic["interface_design_drawing"] = file_info_dic.get(
                "interface_design_drawing", []
            )
            datalist_dic["interface_documentation"] = file_info_dic.get(
                "interface_documentation", []
            )
            datalist_dic["framework_code"] = project_data.get("code_url", "")
            datalist_dic["datasheet_documentation"] = file_info_dic.get(
                "datasheet_documentation", []
            )
        return datalist_dic

    def files_message(self, project_id):
        self.dump_fields = ["path", "code_url"]
        self.pdms = ProjectDataModelSchema(only=self.dump_fields)
        project_data = self.pdms.dump(self.OPDM.search_data_by_id(project_id))
        datalist_dic = self.__obtain_file_messages(project_data)
        return datalist_dic


class ProProgressRecordController:
    def __init__(self) -> None:
        self.OPDM = OperProjectDataModel()
        self.OFDM = OperFunctionDataModel()

    def __search_data_by_id(self, empid, page, size):
        dump_fields = ["id", "project_nm"]
        datalist, count = self.OPDM.search_by_empid(empid, page, size)
        self.pdms = ProjectDataModelSchema(only=dump_fields, many=True)
        project_data = self.pdms.dump(datalist)
        for i in range(len(datalist)):
            project_data[i]["total_record_num"] = datalist[i].total_record_num
        return project_data, count

    def project_record(self, empid, payload):
        page = payload.get("page", 1)
        size = payload.get("size", 10)
        datalist, count = self.__search_data_by_id(empid, page, size)
        total_page = get_total_page(size, count)
        return {"total_page": total_page, "total_count": count, "data_list": datalist}


class ProFunProgressRecordController:
    def __init__(self) -> None:
        self.OFDM = OperFunctionDataModel()
        self.OPRD = OperProgressRecordDataModel()

    def __search_data_by_fid(self, empid, project_id, page, size):
        self.dump_fields = ["id", "function_nm"]
        datalist, count = self.OFDM.search_by_empid(empid, project_id, page, size)
        self.pdms = FunctionDataModelSchema(only=self.dump_fields, many=True)
        project_data = self.pdms.dump(datalist)
        for i in range(len(datalist)):
            project_data[i]["record_num"] = datalist[i].record_num
        return project_data, count

    def pro_fun_record(self, payload, empid, project_id):
        page = payload.get("page")
        size = payload.get("size", 5)
        datalist, count = self.__search_data_by_fid(empid, project_id, page, size)
        total_page = get_total_page(size, count)
        return {"total_page": total_page, "total_count": count, "data_list": datalist}
