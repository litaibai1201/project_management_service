# -*- coding: utf-8 -*-
"""统计接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required
from utils.response import response_result
from controllers.statistics_controller import StatisticsController
from serializes.response_serialize import RspMsgDictSchema

blp = Blueprint("statistics_api", __name__, description="统计接口")
ctrl = StatisticsController()


@blp.route("/member_stats")
class MemberStatsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """成员工作统计"""
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        return response_result(content=ctrl.get_member_stats(start_date=start_date, end_date=end_date))
