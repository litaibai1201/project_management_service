# -*- coding: utf-8 -*-
"""分组/成员管理接口 Blueprint"""
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required
from utils.response import response_result
from controllers.group_controller import GroupController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema
from serializes.group_serialize import (
    MemberQuerySchema, MemberListQuerySchema, StatDataSchema,
    SendReportSchema, ScheduleQuerySchema,
)

blp = Blueprint("group_api", __name__, description="分组成员管理接口")
ctrl = GroupController()


@blp.route("/member")
class MemberListApi(MethodView):
    @jwt_required()
    @blp.arguments(MemberQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """成员列表"""
        return response_result(content=ctrl.list_members(page=query_params["page"], size=query_params["size"], keyword=query_params["keyword"]))


@blp.route("/member/<string:work_no>/project_list")
class MemberProjectsApi(MethodView):
    @jwt_required()
    @blp.arguments(MemberListQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params, work_no):
        """成员项目列表"""
        return response_result(content=ctrl.get_member_projects(work_no, page=query_params["page"], size=query_params["size"]))


@blp.route("/member/<string:work_no>/temporary_duty_list")
class MemberDutiesApi(MethodView):
    @jwt_required()
    @blp.arguments(MemberListQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params, work_no):
        """成员AR列表"""
        return response_result(content=ctrl.get_member_duties(work_no, page=query_params["page"], size=query_params["size"]))


@blp.route("/member/<string:work_no>/statistical_data")
class MemberStatisticalDataApi(MethodView):
    @jwt_required()
    @blp.arguments(StatDataSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, work_no):
        """成员统计数据"""
        return response_result(content=ctrl.get_statistical_data(
            work_no,
            start_date=payload.get("start_date"),
            end_date=payload.get("end_date"),
        ))


@blp.route("/member/<string:work_no>/overview")
class MemberOverviewApi(MethodView):
    @jwt_required()
    @blp.arguments(StatDataSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, work_no):
        """成员总览"""
        return response_result(content=ctrl.get_overview(
            work_no,
            start_date=payload.get("start_date"),
            end_date=payload.get("end_date"),
        ))


@blp.route("/member/<string:work_no>/schedule")
class MemberScheduleApi(MethodView):
    @jwt_required()
    @blp.arguments(ScheduleQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params, work_no):
        """成员日程"""
        return response_result(content=ctrl.get_schedule(work_no, start_date=query_params["start_date"], end_date=query_params["end_date"]))


@blp.route("/member/<string:work_no>/produce_report")
class MemberProduceReportApi(MethodView):
    @jwt_required()
    @blp.arguments(ScheduleQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params, work_no):
        """生成成员报告"""
        return response_result(content=ctrl.produce_report(work_no, start_date=query_params["start_date"], end_date=query_params["end_date"]))


@blp.route("/member/<string:work_no>/send_report")
class MemberSendReportApi(MethodView):
    @jwt_required()
    @blp.arguments(SendReportSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, work_no):
        """发送成员报告"""
        ctrl.send_report(
            work_no,
            start_date=payload.get("start_date"),
            end_date=payload.get("end_date"),
            email=payload.get("email"),
        )
        return response_result()
