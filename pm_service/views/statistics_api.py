# -*- coding: utf-8 -*-
"""统计接口 Blueprint"""
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.statistics_controller import StatisticsController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema
from serializes.statistics_serialize import (
    DateRangeQuerySchema, PersonalStatsQuerySchema, ProgressReportQuerySchema,
)

blp = Blueprint("statistics_api", __name__, description="统计接口")
ctrl = StatisticsController()


@blp.route("/member_stats")
class MemberStatsApi(MethodView):
    @jwt_required()
    @blp.arguments(DateRangeQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params):
        """成员工作统计（仅返回当前用户的直接+间接下属）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_member_stats(work_no=work_no, start_date=query_params["start_date"], end_date=query_params["end_date"]))


@blp.route("/personal_stats")
class PersonalStatsApi(MethodView):
    @jwt_required()
    @blp.arguments(PersonalStatsQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """个人详细工时分析（专案分布/分类分布/周加班）"""
        work_no = query_params["work_no"] or get_identity()
        return response_result(content=ctrl.get_personal_stats(work_no=work_no, start_date=query_params["start_date"], end_date=query_params["end_date"]))


@blp.route("/progress_report")
class ProgressReportApi(MethodView):
    @jwt_required()
    @blp.arguments(ProgressReportQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params):
        """进度报告（按日期范围返回成员进度汇整）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_progress_report(work_no=work_no, start_date=query_params["start_date"], end_date=query_params["end_date"]))


@blp.route("/anomalies")
class AnomaliesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """异常管理看板（自动检测下属的异常项目）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_anomalies(work_no=work_no))
