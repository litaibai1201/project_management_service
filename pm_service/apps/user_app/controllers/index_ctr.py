# -*- coding: utf-8 -*-
"""
@文件: index_controller.py
@說明:
@時間: 2024/03/06 16:01:55
@作者: LiDong
"""

from apps.user_app.models import (OperFunctionDataModel,
                                  OperProjectApplyRecordModel,
                                  OperReviewRecordModel, OperTempDutyModel,
                                  OperTemporaryDutyApplyRecordModel,
                                  OperTwoTableModel)


class UserIndexController:
    def __init__(self) -> None:
        self.OPFM = OperFunctionDataModel()
        self.OPTDM = OperTempDutyModel()
        self.OPTTM = OperTwoTableModel()
        self.OPPARM = OperProjectApplyRecordModel()
        self.OPRRM = OperReviewRecordModel()
        self.OPTDARM = OperTemporaryDutyApplyRecordModel()

    def __get_task_num(self, empid, user_data_dict):
        task_data = self.OPFM.query_dev_tasks_by_emp(empid)
        for data in task_data:
            if data[0] == 1:
                user_data_dict["total_task_num"]["unstart_task"] += 1
            elif data[0] == 2:
                user_data_dict["total_task_num"]["doing_task"] += 1
        duty_data = self.OPTDM.query_dev_tasks_by_emp(empid)
        for data in duty_data:
            if data[0] == 1:
                user_data_dict["total_task_num"]["unstart_duty"] += 1
            elif data[0] == 2:
                user_data_dict["total_task_num"]["doing_duty"] += 1

    def __get_progress_record_num(self, empid, user_data_dict):
        formal_unread_num = self.OPTTM.query_formal_unread_record(empid)
        temp_unread_num = len(self.OPTTM.query_temp_unread_record(empid))
        user_data_dict["total_progress_record_num"] = (
            formal_unread_num + temp_unread_num
        )

    def __get_awaiting_review_num(self, empid, user_data_dict):
        task_ids, task_count = self.OPPARM.query_need_review_task(empid)
        duty_ids, duty_count = self.OPTDARM.query_need_review_task(empid)
        task_review_num = self.OPRRM.query_reviewed_record(task_ids, empid)
        duty_review_num = self.OPRRM.query_reviewed_record(duty_ids, empid)
        task_awaiting_num = task_count - task_review_num
        duty_awaiting_num = duty_count - duty_review_num
        user_data_dict["total_awaiting_review_num"]["project"] = task_awaiting_num
        user_data_dict["total_awaiting_review_num"]["duty"] = duty_awaiting_num

    def query_user_data(self, empid):
        user_data_dict = {
            "total_task_num": {
                "doing_task": 0,
                "unstart_task": 0,
                "doing_duty": 0,
                "unstart_duty": 0,
            },
            "total_progress_record_num": 0,
            "total_awaiting_review_num": {"project": 0, "duty": 0},
        }
        self.__get_task_num(empid, user_data_dict)
        self.__get_progress_record_num(empid, user_data_dict)
        self.__get_awaiting_review_num(empid, user_data_dict)
        return user_data_dict
