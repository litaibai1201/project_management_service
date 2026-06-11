# -*- coding: utf-8 -*-
"""日报接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.daily_log_controller import DailyLogController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema
from serializes.daily_log_serialize import (
    CreateDailyLogSchema, UpdateDailyLogSchema, DailyLogQuerySchema,
    SyncTaskProgressSchema, RevertTaskProgressSchema,
    SuggestQuerySchema, TaskEntriesQuerySchema,
)

blp = Blueprint("daily_log_api", __name__, description="日报管理接口")
ctrl = DailyLogController()


@blp.route("")
class DailyLogListApi(MethodView):
    @jwt_required()
    @blp.arguments(DailyLogQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """日报列表"""
        return response_result(content=ctrl.list_logs(
            page=query_params.get("page", 1),
            size=query_params.get("size", 20),
            start_date=query_params.get("start_date") or None,
            end_date=query_params.get("end_date") or None,
            work_no=query_params.get("work_no") or None,
            status=query_params.get("status"),
        ))

    @jwt_required()
    @blp.arguments(CreateDailyLogSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """创建日报"""
        return response_result(content=ctrl.create_log(payload))


@blp.route("/suggest")
class DailyLogSuggestApi(MethodView):
    @jwt_required()
    @blp.arguments(SuggestQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params):
        """从当天任务进度记录生成日志建议条目"""
        work_no = get_identity()
        date = query_params.get("date") or None
        return response_result(content=ctrl.get_suggest(work_no, date=date))


@blp.route("/task_entries")
class DailyLogTaskEntriesApi(MethodView):
    @jwt_required()
    @blp.arguments(TaskEntriesQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params):
        """查询某任务在所有日志中手动新增或更新的条目（供任务进度页面展示）"""
        task_type = query_params.get("task_type", "project")
        task_id   = query_params.get("task_id", "")
        if not task_id:
            return response_result(content=[])
        return response_result(content=ctrl.get_task_entries(task_type, task_id))


@blp.route("/sync_task_progress")
class DailyLogSyncTaskProgressApi(MethodView):
    @jwt_required()
    @blp.arguments(SyncTaskProgressSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """将日志中用户修改的进度值同步到任务表的 progress 字段"""
        ctrl.sync_task_progress(payload["task_type"], payload["task_id"], payload["progress"])
        return response_result()


@blp.route("/revert_task_progress")
class DailyLogRevertTaskProgressApi(MethodView):
    @jwt_required()
    @blp.arguments(RevertTaskProgressSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """删除日志条目后回滚任务进度"""
        ctrl.revert_task_progress(payload["task_type"], payload["task_id"])
        return response_result()


@blp.route("/<string:log_id>")
class DailyLogDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, log_id):
        """获取日报详情"""
        return response_result(content=ctrl.get_log(log_id))

    @jwt_required()
    @blp.arguments(UpdateDailyLogSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, log_id):
        """更新日报"""
        ctrl.update_log(log_id, payload)
        return response_result()


@blp.route("/<string:log_id>/files/<string:file_id>/preview")
class DailyLogFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, log_id, file_id):
        """预览/下载日报附件"""
        return ctrl.get_file(log_id, file_id)


@blp.route("/<string:log_id>/upload")
class DailyLogUploadApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def post(self, log_id):
        """上传日报附件"""
        return response_result(content=ctrl.upload_attachments(log_id, request.files))
