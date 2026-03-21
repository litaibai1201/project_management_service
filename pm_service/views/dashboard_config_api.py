# -*- coding: utf-8 -*-
"""首页 Widget 配置接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from serializes.response_serialize import RspMsgRawSchema, RspMsgDictSchema
from controllers.dashboard_config_controller import DashboardConfigController

blp  = Blueprint("dashboard_config_api", __name__, description="首页 Widget 配置接口")
ctrl = DashboardConfigController()


@blp.route("/config")
class DashboardConfigApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取当前用户的 widget 配置（view_type=personal|manager）"""
        work_no   = get_identity()
        view_type = request.args.get("view_type", "personal")
        return response_result(content=ctrl.get_config(work_no, view_type))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self):
        """保存当前用户的 widget 可见性配置"""
        work_no  = get_identity()
        payload  = request.get_json() or {}
        view_type = payload.get("view_type", "personal")
        widgets   = payload.get("widgets", [])
        ctrl.save_config(work_no, view_type, widgets)
        return response_result()
