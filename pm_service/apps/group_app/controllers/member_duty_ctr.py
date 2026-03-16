import math
from datetime import datetime

from apps.group_app.models import OperMemberDataModel
from common.common_tools import CommonTools
from serialize.model_serizlize import (
    TemporaryDutyModelSchema,
    TemporaryDutyRecordDataModelSchema,
)


class MemberDutyController:
    def __init__(self, payload, member) -> None:
        self.size = payload.get("size", 5)
        self.page = payload["page"]
        self.start_date = payload.get("start_date", CommonTools.get_now("date"))
        self.end_date = payload.get("end_date", CommonTools.get_now("date"))
        self.member = member
        self.data_list = []
        self.omdm = OperMemberDataModel()
        self.tdms = TemporaryDutyModelSchema()
        self.tdrdms = TemporaryDutyRecordDataModelSchema()

    def __calc_total_working_hour(self, duty_data):
        time_limit = datetime.strptime("12:00:00", "%H:%M:%S").time()
        if duty_data.get("start_time") and duty_data.get("end_time"):
            start_time = datetime.strptime(duty_data["start_time"], "%Y-%m-%d %H:%M:%S")
            end_time = datetime.strptime(duty_data["end_time"], "%Y-%m-%d %H:%M:%S")
            time_interval = end_time - start_time
            start_week = start_time.isocalendar()[1]
            end_week = end_time.isocalendar()[1]
            week_num = end_week - start_week
            if start_time.time() <= time_limit and end_time.time() > time_limit:
                result = time_interval.days * 8 + (time_interval.seconds / 3600 - 1.5)
            else:
                result = time_interval.days * 8 + time_interval.seconds / 3600
            result = float(result) - week_num * 2 * 8
            return round(result, 2)
        return None

    def __submit_total_working_hour(self, duty_data, record_data):
        total_hour = 0
        for data in record_data:
            if data[0] == duty_data.get("id"):
                total_hour += float(data[1])
        return total_hour

    def __extract_duty_record(self, duty_data):
        duty_record_db = self.omdm.search_duty_record_by_duty_id(duty_data["id"])
        record_data = self.tdrdms.dump(duty_record_db)
        return record_data

    def __make_data_list(self, duty_data, total_time, record_data):
        self.data_list.append(
            {
                "duty_id": duty_data["id"],
                "duty_nm": duty_data["duty_nm"],
                "status": duty_data["status"],
                "progress": duty_data["progress"],
                "expected_start_date": duty_data["expected_start_date"],
                # "start_time": duty_data["start_time"],
                "expected_end_date": duty_data["expected_end_date"],
                # "end_time": duty_data["end_time"],
                "total_working_hour": total_time,
                "last_update_content": record_data.get("progress_record", None),
                "last_update_person": record_data.get("submitter", None),
                # "last_update_time": record_data.get("created_at", None),
            }
        )

    def __get_member_duty_list(self):
        duty_db, self.total = self.omdm.search_duty_data_by_responsible(
            self.member, self.page, self.size
        )
        progress_record_data = self.omdm.search_duty_submit_record_data()
        record_data_list = [data[0] for data in progress_record_data]
        for db_data in duty_db:
            duty_data = self.tdms.dump(db_data)
            if duty_data.get("id") not in record_data_list:
                total_time = self.__calc_total_working_hour(duty_data)
            else:
                total_time = self.__submit_total_working_hour(
                    duty_data, progress_record_data
                )
            record_data = self.__extract_duty_record(duty_data)
            self.__make_data_list(duty_data, total_time, record_data)

    def get_member_duty(self):
        self.__get_member_duty_list()
        return {
            "total_page": math.ceil(self.total / self.size),
            "total_count": self.total,
            "data_list": self.data_list,
        }
