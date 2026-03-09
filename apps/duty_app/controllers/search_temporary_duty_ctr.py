# -*- coding: utf-8 -*-
"""
@文件: create_update_delete_project_controller.py
@說明:
@時間: 2024/03/06 16:24:07
@作者: LiDong
"""
from apps.duty_app.models import OperTemporaryDutyModel
from serialize.model_serizlize import TemporaryDutyModelSchema


class SearchTemporaryDutyController:
    def __init__(self) -> None:
        self.otdm = OperTemporaryDutyModel()
        self.exclude_fields = [
            "id", "path", "reserved1", "reserved2", "created_at",
            "status_update_at", "updated_at"
        ]
        self.tdms = TemporaryDutyModelSchema(exclude=self.exclude_fields)

    def get_temporary_duty(self, duty_id):
        data = self.otdm.search_data_by_duty_id(duty_id)
        content = self.tdms.dump(data)
        if not content:
            return "temporary_duty_id不存在", False
        return content, True
