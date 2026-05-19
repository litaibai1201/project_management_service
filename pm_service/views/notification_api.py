# -*- coding: utf-8 -*-
"""消息通知接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.notification_controller import NotificationController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp = Blueprint("notification_api", __name__, description="消息通知接口")
ctrl = NotificationController()


@blp.route("/list")
class NotificationListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取当前用户通知列表"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 30))
        return response_result(content=ctrl.list_notifications(work_no, page, size))


@blp.route("/<string:notif_id>/read")
class NotificationReadApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def patch(self, notif_id):
        """标记单条通知为已读"""
        work_no = get_identity()
        ctrl.mark_read(work_no, notif_id)
        return response_result()


@blp.route("/read_all")
class NotificationReadAllApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def patch(self):
        """标记全部通知为已读"""
        work_no = get_identity()
        ctrl.mark_all_read(work_no)
        return response_result()


@blp.route("/remind_daily_log")
class DailyLogRemindApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def post(self):
        """向指定成員發送今日日報填寫提醒（支持批量）"""
        data = request.get_json() or {}
        work_nos = data.get("work_nos", [])
        count = ctrl.send_daily_log_reminder(work_nos)
        return response_result(msg=f"已向 {count} 位成員發送提醒")
