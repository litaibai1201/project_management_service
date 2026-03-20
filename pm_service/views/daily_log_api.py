# -*- coding: utf-8 -*-
"""日报接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required
from utils.response import response_result
from controllers.daily_log_controller import DailyLogController
from serializes.response_serialize import RspMsgDictSchema

blp = Blueprint("daily_log_api", __name__, description="日报管理接口")
ctrl = DailyLogController()


@blp.route("")
class DailyLogListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """日报列表"""
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        work_no = request.args.get("work_no")
        status = request.args.get("status")
        return response_result(content=ctrl.list_logs(
            page=page, size=size,
            start_date=start_date, end_date=end_date,
            work_no=work_no,
            status=int(status) if status else None,
        ))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建日报"""
        payload = request.get_json() or {}
        return response_result(content=ctrl.create_log(payload))


@blp.route("/<string:log_id>")
class DailyLogDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, log_id):
        """获取日报详情"""
        return response_result(content=ctrl.get_log(log_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, log_id):
        """更新日报"""
        payload = request.get_json() or {}
        ctrl.update_log(log_id, payload)
        return response_result()


@blp.route("/<string:log_id>/upload")
class DailyLogUploadApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, log_id):
        """上传日报附件"""
        # 文件上传功能预留接口
        return response_result(content=[])
