# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""

from flask import request

from apps.duty_app.models import OperTemporaryDutyModel
from common.common_tools import CommonTools
from dbs.mysql_db import DBFunction
from influxDB.influxdb_oper import oper_fluxdb
from serialize.model_serizlize import TemporaryDutyModelSchema


class DeleteTemporaryDutyController:
    def __init__(self) -> None:
        self.otdm = OperTemporaryDutyModel()
        self.tdms = TemporaryDutyModelSchema()

    def __write_data_to_influxdb(self, user_id, duty_data):
        oper_fluxdb.add_record(
            user_id,
            "delete_duty_task",
            "success",
            f"刪除名稱為{duty_data['duty_nm']}({duty_data['id']})的臨時任務",
            request.headers.get("X-Real-IP"),
        )

    def delete_temporary_duty(self, user_id, duty_id):
        duty_data = self.otdm.search_data_by_duty_id(duty_id)
        if not duty_data:
            return "temporary_duty_id不存在", False
        if duty_data.status not in [1, 2]:
            return "臨時任務處於審核或完結狀態，無法刪除", False
        temporary_duty_db = self.tdms.dump(duty_data)
        if user_id != temporary_duty_db["creator"]:
            return "你不是任务创建者，无法删除", False
        result, flag = self.otdm.delete_temporary_duty_by_id(duty_id)
        result, flag = DBFunction.do_commit(result, flag)
        if flag:
            self.__write_data_to_influxdb(user_id, temporary_duty_db)
        return result, flag


class SetStatusController:

    def __delete(self, user_id, duty_id):
        dpc = DeleteTemporaryDutyController()
        return dpc.delete_temporary_duty(user_id, duty_id)

    def __pause(self, user_id, duty_id):
        otdm = OperTemporaryDutyModel()
        data = otdm.search_pause_by_id(user_id, duty_id)
        if not data:
            return "無此權限", False
        data.last_status = data.status
        data.status = 8
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("任務已暫停", True)

    def __restore(self, user_id, duty_id):
        otdm = OperTemporaryDutyModel()
        data = otdm.search_pause_by_id(user_id, duty_id, [8])
        if not data:
            return "無此權限", False
        data.status = data.last_status
        data.updated_at = CommonTools.get_now()
        return DBFunction.do_commit("任務已恢復", True)

    def run(self, user_id, duty_id, payload):
        status = payload.get("status")
        if status == 0:
            return self.__delete(user_id, duty_id)
        elif status == 8:
            return self.__pause(user_id, duty_id)
        elif status == 9:
            return self.__restore(user_id, duty_id)
        return "狀態碼錯誤", False
