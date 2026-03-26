# -*- coding: utf-8 -*-
"""临时任务接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.duty_controller import DutyController
from serializes.response_serialize import RspMsgDictSchema

blp = Blueprint("duty_api", __name__, description="临时任务管理接口")
ctrl = DutyController()


# ─── Duty CRUD ───────────────────────────────────────────────────────────────

@blp.route("/temporary_duty_list")
class DutyListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """临时任务列表"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.list_duties(payload, work_no=work_no))


@blp.route("/create_temporary_duty")
class DutyCreateApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建临时任务"""
        work_no = get_identity()
        payload = request.form.to_dict()
        return response_result(content=ctrl.create_duty(payload, creator=work_no))


@blp.route("/<string:duty_id>")
class DutyDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, duty_id):
        """获取临时任务详情"""
        return response_result(content=ctrl.get_duty(duty_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, duty_id):
        """更新临时任务"""
        payload = request.form.to_dict()
        ctrl.update_duty(duty_id, payload)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, duty_id):
        """删除临时任务"""
        ctrl.delete_duty(duty_id)
        return response_result()


@blp.route("/<string:duty_id>/allocation")
class DutyAllocationApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, duty_id):
        """分配临时任务"""
        payload = request.get_json() or {}
        ctrl.allocate(duty_id, payload)
        return response_result()


@blp.route("/<string:duty_id>/set_status")
class DutySetStatusApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, duty_id):
        """设置任务状态"""
        payload = request.get_json() or {}
        ctrl.set_status(duty_id, payload["status"])
        return response_result()


@blp.route("/<string:duty_id>/files")
class DutyFilesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, duty_id):
        """获取任务文件"""
        return response_result(content=[])


# ─── Progress ────────────────────────────────────────────────────────────────

@blp.route("/progress")
class DutyUnreadProgressApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """未读进度数量"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.get_unread_progress_count(work_no))


@blp.route("/<string:duty_id>/progress")
class DutyProgressApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, duty_id):
        """获取任务进度"""
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.get_progress(duty_id, page=page, size=size))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, duty_id):
        """创建任务进度"""
        work_no = get_identity()
        payload = request.form.to_dict()
        ctrl.create_progress(duty_id, payload, submitter=work_no)
        return response_result()


# ─── Review ──────────────────────────────────────────────────────────────────

@blp.route("/review_list")
class DutyReviewListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """任务审核列表"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.get_review_list(page=page, size=size, work_no=work_no))


@blp.route("/review/<string:review_id>")
class DutyReviewApproveApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, review_id):
        """审核操作"""
        payload = request.get_json() or {}
        ctrl.approve_review(
            review_id,
            status=payload.get("status"),
            reject_reason=payload.get("reject_reason", ""),
            countersigns=payload.get("countersigns", []),
        )
        return response_result()


@blp.route("/review/<string:review_id>/countersign")
class DutyReviewCountersignApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, review_id):
        """加签"""
        payload = request.get_json() or {}
        ctrl.countersign_review(
            review_id,
            approver_work_no=payload.get("approver_work_no", ""),
            approver_name=payload.get("approver_name", ""),
        )
        return response_result()


@blp.route("/tasklist")
class DutyTaskListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """任务清单"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.get_task_list(work_no, page=page, size=size))
