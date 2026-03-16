# -*- coding: utf-8 -*-
'''
@文件: schedule_ctr.py
@說明:
@時間: 2025/04/02 15:36:31
@作者: LiDong
'''
from apps.group_app.models import OperFunctionDataModel, OperTemporaryDutyModel
from apps.group_app.serializes import ScheduleDataSchema
from common.common_tools import CommonTools
from serialize.model_serizlize import TemporaryDutyModelSchema


class ScheduleController:
    def __format_data(self, data):
        if data["status"] == 4:
            data["status"] = 2
        end_data = data["expected_end_date"]
        latest_expected_end_date = data.pop("latest_expected_end_date")
        if latest_expected_end_date:
            end_data = latest_expected_end_date
            data["expected_end_date"] = latest_expected_end_date
        if end_data and CommonTools.get_now("date") > end_data:
            data["status"] = 3

    def __search_func_data(self, payload, user_id):
        ofdm = OperFunctionDataModel()
        datalist = ofdm.search_func_by_schedule(payload, user_id)
        sds = ScheduleDataSchema(many=True)
        datalist = sds.dump(datalist)
        for data in datalist:
            self.__format_data(data)
        return datalist

    def __search_duty_data(self, payload, user_id):
        otdm = OperTemporaryDutyModel()
        datalist = otdm.search(payload, user_id)
        tdms = TemporaryDutyModelSchema(
            only=[
                "id", "duty_nm", "expected_start_date", "expected_end_date",
                "latest_expected_end_date", "priority", "status"
            ],
            many=True
        )
        datalist = tdms.dump(datalist)
        for data in datalist:
            self.__format_data(data)
            self.__format_duty_data(data)
        return datalist

    def __format_duty_data(self, data):
        data["function_id"] = data.pop("id")
        data["project_id"] = ""
        data["project_nm"] = "臨時任務"

    def run(self, payload, user_id):
        func_datalist = self.__search_func_data(payload, user_id)
        duty_datalist = self.__search_duty_data(payload, user_id)
        return func_datalist + duty_datalist
