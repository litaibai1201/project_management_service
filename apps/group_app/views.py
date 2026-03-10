# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/06/06 16:02:03
@作者: LiDong
"""


from flask import send_file
from flask.views import MethodView
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from apps.group_app.controllers.member_ctr import MemberController
from apps.group_app.controllers.member_duty_ctr import MemberDutyController
from apps.group_app.controllers.member_produce_report_ctr import \
    MemberProduceReportController
from apps.group_app.controllers.member_project_ctr import \
    MemberProjectController
from apps.group_app.controllers.overview_ctr import OverviewController
from apps.group_app.controllers.schedule_ctr import ScheduleController
from apps.group_app.controllers.send_report_ctr import SendReportController
from apps.group_app.controllers.statistical_data_ctr import \
    StatisticalDataController
from apps.group_app.serializes import (MemberApiSchema,
                                       MemberProduceReportApiSchema,
                                       OverviewApiSchema, SendReportApiSchema,
                                       StatisticalDataApiSchema)
from common.common_method import fail_response_result, response_data_result
from serialize.response_serialize import (RspBaseSchema, RspMsgDictSchema,
                                          RspMsgListSchema)

blp = Blueprint("group", __name__, url_prefix="/api/group")


@blp.route("/member")
class MemberApi(MethodView):
    """
    此類用來定義/member及請求方式
    """

    @jwt_required()
    @blp.arguments(MemberApiSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        mc = MemberController()
        result, flag = mc.get_member(user_id)
        if not flag:
            return fail_response_result(msg="獲取小組成員失敗")
        content = mc.get_member_info(payload, result)
        return response_data_result(content=content)


@blp.route("/member/<string:work_no>/project_list")
class MemberProjectApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/project_list及請求方式
    """

    @jwt_required()
    @blp.arguments(MemberApiSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, work_no):
        mpc = MemberProjectController(payload, work_no)
        content = mpc.get_member_project()
        return response_data_result(content=content)


@blp.route("/member/<string:work_no>/temporary_duty_list")
class MemberDutyApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/temporary_duty_list及請求方式
    """

    @jwt_required()
    @blp.arguments(MemberApiSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, work_no):
        mdc = MemberDutyController(payload, work_no)
        content = mdc.get_member_duty()
        return response_data_result(content=content)


@blp.route("/member/<string:work_no>/produce_report")
class MemberProduceReportApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/produce_report及請求方式
    """

    @jwt_required()
    @blp.arguments(MemberProduceReportApiSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, work_no):
        mprc = MemberProduceReportController(payload, work_no)
        result, flag = mprc.produce_member_report()
        if not flag:
            return fail_response_result(content=payload, msg=result)
        else:
            return response_data_result(content=result)


@blp.route("/member/<string:work_no>/send_report")
class SendReportApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/send_report及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(SendReportApiSchema)
    @blp.response(200, RspBaseSchema)
    def post(self, payload, work_no):
        mprc = SendReportController()
        result, flag = mprc.save_report_to_doc(payload, work_no)
        if not flag:
            return fail_response_result(msg=result)
        return send_file(result)


@blp.route("/member/<string:work_no>/statistical_data")
class StatisticalDataApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/statistical_data及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(StatisticalDataApiSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, work_no):
        sdc = StatisticalDataController()
        result = sdc.run(payload, work_no)
        return response_data_result(result)


@blp.route("/member/<string:work_no>/overview")
class OverviewApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/overview及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(OverviewApiSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, work_no):
        oc = OverviewController()
        result = oc.run(payload, work_no)
        return response_data_result(result)


@blp.route("/member/<string:work_no>/schedule")
class ScheduleApi(MethodView):
    """
    此類用來定義/member/<string:work_no>/schedule及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(MemberProduceReportApiSchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload, work_no):
        sc = ScheduleController()
        result = sc.run(payload, work_no)
        return response_data_result(result)
