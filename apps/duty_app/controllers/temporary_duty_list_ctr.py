# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
from apps.duty_app.models import OperTemporaryDutyModel
from common.common_tools import CommonTools
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

    def get_group_mem(self, empid):
        url = "http://10.126.1.237:13570/api/searchSubordinates"
        result, flag = CommonTools.send_get_request(url, data={"empid": empid})
        if flag:
            empid_list = [empid]
            for k in result["content"].keys():
                empid_list.append(k)
            return empid_list, flag
        return f"{url}: {result}, 查詢下屬成員失敗", flag

    def temporary_duty_list(self, empid, payload):
        # 判斷登錄者的身份
        result, flag = self.get_group_mem(empid)
        if not flag:
            return result, flag
        datalist, total_count = self.otdm.search_data_list(result, **payload)
        datalist = self.tdms.dump(datalist)
        count = payload.get("size", 10)
        total_page = CommonTools.get_total_page(count, total_count)
        return {
            "total_page": total_page,
            "total_count": total_count,
            "project_list": datalist
        }
