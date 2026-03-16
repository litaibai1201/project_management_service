from apps.user_app.models import (
    OperReviewRecordModel,
    OperTemporaryDutyApplyRecordModel,
    OperTempDutyModel,
)
from common.common_tools import get_now
from serialize.model_serizlize import TemporaryDutyApplyRecordModelSchema


class DutyMyApplyCancelController:
    def __init__(self, apply_id) -> None:
        self.apply_id = apply_id
        self.otdarm = OperTemporaryDutyApplyRecordModel()
        self.orrm = OperReviewRecordModel()
        self.otdm = OperTempDutyModel()
        self.tdrms = TemporaryDutyApplyRecordModelSchema()

    def my_apply_cancel(self):
        if self.orrm.search_first_review_by_id(self.apply_id):
            return "操作失敗", False
        data = self.tdrms.dump(
            self.otdarm.search_apply_data_by_apply_id_status(self.apply_id)
        )
        if not data:
            return "apply_id不存在", False
        if not self.otdm.update_data_by_duty_id(data["duty_id"]):
            return "更新數據庫失敗", False
        update_dict = {"status": 2, "updated_at": get_now()}
        if not self.otdarm.update_data_by_id(self.apply_id, update_dict)[1]:
            return "更新數據庫失敗", False
        return "", True
