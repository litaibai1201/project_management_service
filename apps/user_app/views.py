# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/03/06 15:59:34
@作者: LiDong
"""

from flask import request
from flask.views import MethodView
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from apps.user_app.controllers.audit_record_duty import \
    DutyAuditRecordController
from apps.user_app.controllers.audit_record_project import \
    ProjectAuditRecordController
from apps.user_app.controllers.index_ctr import UserIndexController
from apps.user_app.controllers.latest_news_ctr import UserLatestNewsController
from apps.user_app.controllers.login_ctr import LogInController
from apps.user_app.controllers.my_apply_duty_cancel_ctr import \
    DutyMyApplyCancelController
from apps.user_app.controllers.my_apply_duty_ctr import DutyMyApplyController
from apps.user_app.controllers.my_apply_project_cancel_ctr import \
    ProjectMyApplyCancelController
from apps.user_app.controllers.my_apply_project_ctr import \
    ProjectMyApplyController
from apps.user_app.controllers.project_ctr import UserProjectController
from apps.user_app.controllers.statistical_ctr import UserStatisticalController
from apps.user_app.controllers.temp_duty_ctr import UserTempDutyController
from apps.user_app.serializes import (AuditRecordSchema, LogInSchema,
                                      MyApplySchema, RspLogInLogOutSchema,
                                      RspUserLstestNewsSchema,
                                      RspUserPageSchema,
                                      RspUserStatisticalSchema,
                                      UserLstestNewsSchema, UserProjectSchema,
                                      UserTempDutySchema)
from common.common_method import fail_response_result, response_data_result
from influxDB.influxdb_oper import oper_fluxdb
from serialize.response_serialize import (RspMsgDictSchema, RspMsgListSchema,
                                          RspMsgSchema)

blp = Blueprint("user", __name__, url_prefix="/api/user")


@blp.route("/login")
class LoginApi(MethodView):
    """
    此類用來定義/login及請求方式
    """

    @blp.arguments(LogInSchema)
    @blp.response(200, RspLogInLogOutSchema)
    def post(self, payload):
        lic = LogInController(payload)
        result_ad = lic.log_in_ad()
        if not result_ad:
            return fail_response_result(msg="AD請求失敗")
        elif result_ad["code"] != "S10000":
            return fail_response_result(msg="工號或密碼或園區錯誤")
        token_payload = lic.get_token_payload()
        oper_fluxdb.add_record(
            payload["work_no"],
            "login",
            "success",
            "登錄系統",
            request.headers.get("X-Real-IP"),
        )
        return response_data_result(content=token_payload)


@blp.route("/index")
class IndexApi(MethodView):
    """
    此類用來定義/index及請求方式
    """

    def __init__(self) -> None:
        super().__init__()
        self.UIC = UserIndexController()

    @jwt_required()
    @blp.response(200, RspUserPageSchema)
    def get(self):
        empid = get_jwt_identity()["empid"]
        data = self.UIC.query_user_data(empid)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/project")
class ProjectApi(MethodView):
    """
    獲取個人主頁中的專案清單內容
    """

    def __init__(self) -> None:
        super().__init__()
        self.UPC = UserProjectController()

    @jwt_required()
    @blp.arguments(UserProjectSchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        data = self.UPC.query_user_project_data(empid, payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/temporary_duty")
class TemporaryDutyApi(MethodView):
    """
    獲取個人主頁中的臨時任務內容
    """

    def __init__(self) -> None:
        super().__init__()
        self.UTDC = UserTempDutyController()

    @jwt_required()
    @blp.arguments(UserTempDutySchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        data = self.UTDC.query_user_temp_duty_data(empid, payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/latest_news")
class LatestNewsApi(MethodView):
    """
    獲取個人主頁中的最新動態
    """

    def __init__(self) -> None:
        super().__init__()
        self.ULNC = UserLatestNewsController()

    @jwt_required()
    @blp.arguments(UserLstestNewsSchema, location="query")
    @blp.response(200, RspUserLstestNewsSchema)
    def get(self, payload):
        data = self.ULNC.query_user_latest_news_data(payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/statistical")
class StatisticalApi(MethodView):
    """
    獲取個人主頁中的個人任務概覽
    """

    def __init__(self) -> None:
        super().__init__()
        self.USC = UserStatisticalController()

    @jwt_required()
    @blp.response(200, RspUserStatisticalSchema)
    def get(self):
        empid = get_jwt_identity()["empid"]
        data = self.USC.query_user_statistical(empid)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/project/my_apply")
class ProjectMyApplyApi(MethodView):
    """
    此類用來定義/project/my_apply
    """

    @jwt_required()
    @blp.arguments(MyApplySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        pmac = ProjectMyApplyController(payload, user_id)
        req = pmac.get_my_apply_project()
        return response_data_result(content=req)


@blp.route("/temporary_duty/my_apply")
class DutyMyApplyApi(MethodView):
    """
    此類用來定義/temporary_duty/my_apply
    """

    @jwt_required()
    @blp.arguments(MyApplySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        dmac = DutyMyApplyController(payload, user_id)
        req = dmac.get_my_apply_duty()
        return response_data_result(content=req)


@blp.route("/project/apply/<string:apply_id>")
class ProjectMyApplyCancelApi(MethodView):
    """
    此類用來定義/project/<apply_id>/cancel
    """

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def put(self, apply_id):
        pmacc = ProjectMyApplyCancelController(apply_id)
        result, flag = pmacc.my_apply_cancel()
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/temporary_duty/apply/<string:apply_id>")
class DutyMyApplyCancelApi(MethodView):
    """
    此類用來定義/temporary_duty/<apply_id>/cancel
    """

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def put(self, apply_id):
        dmacc = DutyMyApplyCancelController(apply_id)
        result, flag = dmacc.my_apply_cancel()
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/project/audit_record")
class ProjectAuditRecordApi(MethodView):
    """
    此類用來定義/project/audit_record
    """

    @jwt_required()
    @blp.arguments(AuditRecordSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        parc = ProjectAuditRecordController(user_id, payload)
        req = parc.audit_record_project()
        return response_data_result(content=req)


@blp.route("/duty/audit_record")
class DutyAuditRecordApi(MethodView):
    """
    此類用來定義/duty/audit_record
    """

    @jwt_required()
    @blp.arguments(AuditRecordSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        darc = DutyAuditRecordController(user_id, payload)
        req = darc.audit_record_duty()
        return response_data_result(content=req)
