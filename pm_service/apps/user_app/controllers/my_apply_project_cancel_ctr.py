from apps.user_app.models import (
    OperProjectApplyRecordModel,
    OperProjectDataModel,
    OperReviewRecordModel,
    OperFunctionDataModel,
)
from common.common_tools import get_now
from serialize.model_serizlize import ProjectApplyRecordModelSchema


class ProjectMyApplyCancelController:
    def __init__(self, apply_id) -> None:
        self.apply_id = apply_id
        self.oparm = OperProjectApplyRecordModel()
        self.orrm = OperReviewRecordModel()
        self.opdm = OperProjectDataModel()
        self.ofdm = OperFunctionDataModel()
        self.parms = ProjectApplyRecordModelSchema()

    def __search_and_judge_pro_status(self, project_id):
        data = self.opdm.search_pro_data_by_pid(project_id)
        if data:
            if data[1] == 2:
                return 1, True
            elif data[1] == 4:
                return 3, True
            elif data[1] == 6:
                return 5, True
            return "專案狀態出錯", False
        return "專案不存在", False

    def my_apply_cancel(self):
        if self.orrm.search_first_review_by_id(self.apply_id):
            return "撤銷失敗", False
        data = self.oparm.search_apply_data_by_apply_id_status(self.apply_id)
        if not data:
            return "apply_id不存在", False
        data = self.parms.dump(data)
        project_id = data.get("project_id")
        function_id = data.get("function_id")
        if function_id:
            apply_type = data.get("apply_type")
            if apply_type == "完結功能":
                status = 2
            elif apply_type == "創建功能":
                status = 0
            if not self.ofdm.update_fun_status(function_id, status):
                return "功能狀態更新失敗", False
        elif project_id and function_id is None:
            result, flag = self.__search_and_judge_pro_status(project_id)
            if flag:
                if not self.opdm.update_pro_status(result, project_id):
                    return "專案狀態更新失敗", False
        update_dict = {"status": 2, "updated_at": get_now()}
        if not self.oparm.update_data_by_id(self.apply_id, update_dict):
            return "更新數據庫失敗", False
        return "", True
