# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
from apps.duty_app.models import OperTemporaryDutyModel
from common.common_tools import CommonTools
from apps.user_app.models import get_subordinate_ids
from serialize.model_serizlize import TemporaryDutyModelSchema


class TemporaryDutyListController:
    def __init__(self) -> None:
        self.otdm = OperTemporaryDutyModel()
        self.dump_fields = [
            "id", "duty_nm", "creator", "expected_start_date",
            "expected_end_date", "start_time", "end_time", "status",
            "priority", "progress", "responsible"
        ]
        self.tdms = TemporaryDutyModelSchema(only=self.dump_fields, many=True)

    def temporary_duty_list(self, empid, payload):
        # 從本地表查詢本人及下屬的工號列表
        empid_list = get_subordinate_ids(empid)
        datalist, total_count = self.otdm.search_data_list(empid_list, **payload)
        datalist = self.tdms.dump(datalist)
        count = payload.get("size", 10)
        total_page = CommonTools.get_total_page(count, total_count)
        return {
            "total_page": total_page,
            "total_count": total_count,
            "project_list": datalist
        }
