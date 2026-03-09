# -*- coding: utf-8 -*-
'''
@文件: overview_ctr.py
@說明:
@時間: 2024/12/30 14:41:00
@作者: LiDong
'''


from apps.group_app.models import OperFunctionDataModel
from common.common_tools import CommonTools
from serialize.model_serizlize import FunctionDataModelSchema


class OverviewController:
    def __init__(self) -> None:
        pass

    def func_model_schema(self):
        datalist = [
            "path", "developers", "status_update_at", "reserved1",
            "reserved2", "updated_at"
        ]
        fdms = FunctionDataModelSchema(exclude=datalist)
        return fdms

    def run(self, payload, empid):
        ofdm = OperFunctionDataModel()
        datalist, total_count = ofdm.search_func(payload, empid)
        fdms = self.func_model_schema()
        result_list = list()
        for data in datalist:
            func_dict = fdms.dump(data[0])
            func_dict["project_nm"] = data[1]
            func_dict["total_working_hour"] = data[2]
            result_list.append(func_dict)
        count = payload.get("size", 10)
        total_page = CommonTools.get_total_page(count, total_count)
        return {
            "total_page": total_page,
            "total_count": total_count,
            "task_list": result_list
        }
