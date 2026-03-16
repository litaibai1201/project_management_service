# -*- coding: utf-8 -*-
"""
@文件: tasklist_ctr.py
@說明:
@時間: 2024/06/06 17:21:14
@作者: XuHeng
"""

from apps.duty_app.models import OperTemporaryDutyModel
from common.common_tools import CommonTools
from serialize.model_serizlize import TemporaryDutyModelSchema


class TaskListController:
    def __init__(self) -> None:
        self.dump_fields = [
            "id",
            "duty_nm",
            "priority",
            "progress",
            "creator",
            "responsible",
            "expected_start_date",
            "expected_end_date",
            "latest_expected_end_date",
            "revision_count",
            "start_time",
            "end_time",
        ]
        self.tdms = TemporaryDutyModelSchema(only=self.dump_fields, many=True)
        self.otdm = OperTemporaryDutyModel()

    def get_tasklist(self, payload, user_id):
        size = payload.get("size", 10)
        page = payload.get("page", 1)
        status = payload.get("status", 2)
        result = self.otdm.search_data_by_status(user_id, page, size, status)
        datalist, total_count = result
        total_page = CommonTools.get_total_page(size, total_count)
        datalist = self.tdms.dump(datalist)
        for data in datalist:
            if data.get("responsible"):
                data["responsible"] = data["responsible"].split(";")
            else:
                data["responsible"] = list()
        return {
            "total_page": total_page,
            "total_count": total_count,
            "data_list": datalist
        }
