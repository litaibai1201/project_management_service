import math

from apps.user_app.models import OperTemporaryDutyModel
from apps.user_app.serializes import UserTempDutyContentDumpSchema


class UserTempDutyController:
    def __init__(self) -> None:
        self.OPTDM = OperTemporaryDutyModel()

    def query_user_temp_duty_data(self, empid, payload):
        """我是創建者/責任人的臨時任務"""
        status = payload.get("status", 1)
        size = payload.get("size", 5)
        temp_duty_list = self.OPTDM.query_temp_duty(empid, status, size)
        result = []
        for temp_duty in temp_duty_list:
            temp_duty_ser = UserTempDutyContentDumpSchema().dump(temp_duty)
            temp_duty_ser["duty_id"] = temp_duty_ser.pop("id", None)
            result.append(temp_duty_ser)
        return result
