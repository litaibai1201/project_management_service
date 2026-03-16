# -*- coding: utf-8 -*-
"""
@文件: member_ctr.py
@說明:
@時間: 2024/07/26 18:36:54
@作者: LiDong
"""

from datetime import datetime
from functools import cached_property

from apps.group_app.models import OperMemberDataModel
from apps.user_app.models import OperUserHierarchyModel, OperUserProfileModel
from common.common_tools import CommonTools
from serialize.model_serizlize import (
    ProjectDataModelSchema,
    TemporaryDutyModelSchema,
)


class MemberController:
    def __init__(self) -> None:
        self.omdm = OperMemberDataModel()
        self.tdms = TemporaryDutyModelSchema(
            only=["id", "status", "expected_end_date", "status_update_at"]
        )
        self.pdms = ProjectDataModelSchema(only=["id", "status", "status_update_at"])

    @cached_property
    def now_time(self):
        return CommonTools.get_now("date")

    def get_member(self, user_id):
        """
        從本地 user_hierarchy_form / user_profile_form 取得直屬下屬列表，
        返回與原 HR 接口相同的格式：{"content": {work_no: name, ...}}
        """
        ouhm = OperUserHierarchyModel()
        oupm = OperUserProfileModel()
        rows = ouhm.get_direct_subordinates(user_id)
        content = {}
        for row in rows:
            sub_work_no = row[1]
            user = oupm.query_user_by_work_no(sub_work_no)
            if user:
                content[sub_work_no] = user.name
        return {"content": content}, True

    def __get_members(self, payload, result):
        content = result.get("content", dict())
        datalist = list(content.items())
        total_count = len(datalist)
        page = payload.get("page", 1)
        size = payload.get("size", 10)
        total_page = CommonTools.get_total_page(size, total_count)
        result_dict = {"total_count": total_count, "total_page": total_page}
        if not content:
            return dict(), result_dict
        datalist = sorted(datalist, key=lambda x: x[0])
        return dict(datalist[(page - 1) * size : page * size]), result_dict

    def __format_function_dict(self, fun_data_list, start_date, end_date, time_type):
        fun_data_list = self.tdms.dump(fun_data_list, many=True)
        doing = finished = deleted = unstart = 0
        for fun_data in fun_data_list:
            status = fun_data.get("status")
            status_update_at = fun_data.get("status_update_at")
            if status_update_at:
                status_update_at = status_update_at.split(" ")[0]
                is_doing = status == 2
                is_unstart = status == 1
                is_deleted = status == 0 and start_date <= status_update_at <= end_date
                is_finished = status == 3 and start_date <= status_update_at <= end_date
                if is_deleted:
                    deleted += 1
                elif is_finished:
                    finished += 1
                elif is_doing:
                    if time_type != 3:
                        doing += 1
                    else:
                        if status == 2 or (
                            status in [0, 3] and status_update_at > end_date
                        ):
                            doing += 1
                elif is_unstart:
                    if time_type != 3:
                        unstart += 1
            else:
                if time_type != 3:
                    unstart += 1

        function_dict = {
            "fun_total_num": doing + finished + deleted + unstart,
            "doing": doing,
            "finished": finished,
            "deleted": deleted,
            "unstart": unstart,
        }
        return function_dict

    def __format_duty_dict(self, duty_list, start_date, end_date, time_type):
        duty_list = self.tdms.dump(duty_list, many=True)
        doing = finished = deleted = unstart = 0
        is_delay = False
        for duty in duty_list:
            status = duty.get("status")
            status_update_at = duty.get("status_update_at", None)
            exp_end_date = duty.get("expected_end_date")
            if status_update_at:
                status_update_at = duty.get("status_update_at").split(" ")[0]
                is_doing = status == 2
                is_unstart = status == 1
                is_deleted = status == 0 and start_date <= status_update_at <= end_date
                is_finished = status == 3 and start_date <= status_update_at <= end_date
                if is_deleted:
                    deleted += 1
                elif is_finished:
                    finished += 1
                elif is_doing:
                    is_overdue = exp_end_date and exp_end_date < self.now_time
                    doing += 1
                    if is_overdue:
                        is_delay = True
                elif is_unstart:
                    unstart += 1
            else:
                unstart += 1
                if exp_end_date and exp_end_date < self.now_time:
                    is_delay = True
        duty_dict = {
            "total_num": doing + finished + deleted + unstart,
            "doing": doing,
            "finished": finished,
            "deleted": deleted,
            "unstart": unstart,
        }
        return duty_dict, is_delay

    def __get_member_project_hour(self, member, hour_dict):
        if len(hour_dict) > 0:
            for k, v in hour_dict.items():
                if k == member:
                    return v
        return 0

    def __handel_data_from_db(self, data_list):
        hour_dict = {}
        for num, id_num in data_list:
            if id_num in hour_dict:
                hour_dict[id_num] += float(num)
            else:
                hour_dict[id_num] = float(num)
        return hour_dict

    def __get_total_hour(self, member_list, start_date, end_date):
        data_list = self.omdm.search_pro_data_by_submitter(
            member_list, start_date, end_date
        )
        pro_hour_dict = self.__handel_data_from_db(data_list)
        duty_list = self.omdm.search_duty_data_by_submitter(
            member_list, start_date, end_date
        )
        duty_hour_dict = self.__handel_data_from_db(duty_list)
        return pro_hour_dict, duty_hour_dict

    def __format_member_dict(self, **kwargs):
        # name, work_no, is_duty, project_dict, duty_dict
        return kwargs

    def __handle_members_data(
        self, members, start_date, end_date, pro_hour_dict, duty_hour_dict, time_type
    ):
        member_list = list(members.keys())

        # 批量查询：4 次 SQL 取代原先 N×4 次（N = 成员数）
        pro_total_dict = self.omdm.batch_search_project_total_num(
            member_list, start_date, end_date
        )
        fun_data_dict = self.omdm.batch_search_function_data(member_list)
        duty_data_dict = self.omdm.batch_search_duty_data(member_list)
        overdue_members = self.omdm.batch_search_overdue_members(
            member_list, self.now_time
        )

        datalist = list()
        for member, name in members.items():
            project_num = pro_total_dict.get(member, 0)
            fun_data_list = self.__format_function_dict(
                fun_data_dict.get(member, []), start_date, end_date, time_type
            )
            duty_dict, is_delay = self.__format_duty_dict(
                duty_data_dict.get(member, []), start_date, end_date, time_type
            )
            if not is_delay and member in overdue_members:
                is_delay = True
            pro_total_hour = self.__get_member_project_hour(member, pro_hour_dict)
            duty_total_hour = self.__get_member_project_hour(member, duty_hour_dict)
            total_hour = pro_total_hour + duty_total_hour
            member_dict = self.__format_member_dict(
                pro_total_num=project_num,
                name=name,
                work_no=member,
                is_delay=is_delay,
                function=fun_data_list,
                duty=duty_dict,
                total_working_hour=round(total_hour, 2),
            )
            datalist.append(member_dict)
        return datalist

    def get_member_info(self, payload, result):
        start_date = payload.get("start_date", CommonTools.get_now("date"))
        end_date = payload.get("end_date", CommonTools.get_now("date"))
        time_type = payload.get("time_type", 0)
        members, content = self.__get_members(payload, result)
        pro_hour_dict, duty_hour_dict = self.__get_total_hour(
            list(members.keys()), start_date, end_date
        )
        datalist = self.__handle_members_data(
            members, start_date, end_date, pro_hour_dict, duty_hour_dict, time_type
        )
        content["data_list"] = datalist
        return content
