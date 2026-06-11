# -*- coding: utf-8 -*-
"""AR接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.duty_controller import DutyController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema
from serializes.duty_serialize import (
    DutyListQuerySchema, DutyAllocationSchema, SetStatusSchema,
    ReviewActionSchema, CountersignSchema, ProgressQuerySchema,
    DutyRescheduleSchema, DutyActivateSchema, DutySubmitCompletionSchema,
    DutyReqTaskReviewSchema, BatchReqTaskReviewSchema, ReviewApproveSchema,
    ReviewListQuerySchema, TaskListQuerySchema,
)

blp = Blueprint("duty_api", __name__, description="AR管理接口")
ctrl = DutyController()


# ─── Duty CRUD ───────────────────────────────────────────────────────────────


@blp.route("/temporary_duty_list")
class DutyListApi(MethodView):
    @jwt_required()
    @blp.arguments(DutyListQuerySchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """AR列表"""
        work_no = get_identity()
        return response_result(content=ctrl.list_duties(payload, work_no=work_no))


@blp.route("/create_temporary_duty")
class DutyCreateApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建AR"""
        work_no = get_identity()
        payload = request.form.to_dict()
        payload["responsible"] = request.form.getlist("responsible")
        return response_result(content=ctrl.create_duty(payload, creator=work_no))


@blp.route("/<string:duty_id>")
class DutyDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, duty_id):
        """获取AR详情"""
        return response_result(content=ctrl.get_duty(duty_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, duty_id):
        """更新AR"""
        work_no = get_identity()
        payload = request.form.to_dict()
        payload["responsible"] = request.form.getlist("responsible")
        ctrl.update_duty(duty_id, payload, work_no=work_no)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, duty_id):
        """删除AR"""
        work_no = get_identity()
        ctrl.delete_duty(duty_id, work_no=work_no)
        return response_result()


@blp.route("/batch_req_task_review")
class DutyBatchReqTaskReviewApi(MethodView):
    @jwt_required()
    @blp.arguments(BatchReqTaskReviewSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """批量提交需求任務新增審核"""
        work_no = get_identity()
        duty_ids = payload.get("duty_ids", [])
        return response_result(content=ctrl.batch_submit_req_task_review(duty_ids, payload, work_no))


@blp.route("/<string:duty_id>/req_task_review")
class DutyReqTaskReviewApi(MethodView):
    @jwt_required()
    @blp.arguments(DutyReqTaskReviewSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, duty_id):
        """提交需求任務新增審核"""
        work_no = get_identity()
        return response_result(content=ctrl.submit_req_task_review(duty_id, payload, work_no))


@blp.route("/<string:duty_id>/reschedule")
class DutyRescheduleApi(MethodView):
    @jwt_required()
    @blp.arguments(DutyRescheduleSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, duty_id):
        """延期任务（更新预计完成时间，记录历史）"""
        work_no = get_identity()
        return response_result(content=ctrl.reschedule_duty(
            duty_id,
            new_end_date=payload.get("new_end_date", ""),
            reason=payload.get("reason", ""),
            operator=work_no,
        ))


@blp.route("/<string:duty_id>/activate")
class DutyActivateApi(MethodView):
    @jwt_required()
    @blp.arguments(DutyActivateSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, duty_id):
        """激活任务（草稿→进行中），可附带补充字段"""
        work_no = get_identity()
        ctrl.activate_duty(duty_id, work_no, payload=payload)
        return response_result()


@blp.route("/<string:duty_id>/hold")
class DutyHoldApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, duty_id):
        """搁置任务（进行中→搁置）"""
        work_no = get_identity()
        ctrl.hold_duty(duty_id, work_no)
        return response_result()


@blp.route("/<string:duty_id>/resume")
class DutyResumeApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, duty_id):
        """恢复任务（搁置→进行中）"""
        work_no = get_identity()
        ctrl.resume_duty(duty_id, work_no)
        return response_result()


@blp.route("/<string:duty_id>/submit_completion")
class DutySubmitCompletionApi(MethodView):
    @jwt_required()
    @blp.arguments(DutySubmitCompletionSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, duty_id):
        """提交完结审核（进行中→完结审核）"""
        work_no = get_identity()
        reviewer = payload.get("reviewer", [])
        submitter_name = payload.get("submitter_name", "")
        return response_result(content=ctrl.submit_completion(duty_id, work_no, reviewer, submitter_name))


@blp.route("/<string:duty_id>/allocation")
class DutyAllocationApi(MethodView):
    @jwt_required()
    @blp.arguments(DutyAllocationSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, duty_id):
        """分配AR"""
        ctrl.allocate(duty_id, payload)
        return response_result()


@blp.route("/<string:duty_id>/set_status")
class DutySetStatusApi(MethodView):
    @jwt_required()
    @blp.arguments(SetStatusSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, duty_id):
        """设置任务状态"""
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
    @blp.arguments(ProgressQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """未读进度数量"""
        work_no = get_identity()
        return response_result(content=ctrl.get_unread_progress_count(work_no))


@blp.route("/<string:duty_id>/progress")
class DutyProgressApi(MethodView):
    @jwt_required()
    @blp.arguments(ProgressQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params, duty_id):
        """获取任务进度"""
        return response_result(content=ctrl.get_progress(duty_id, page=query_params["page"], size=query_params["size"]))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, duty_id):
        """创建任务进度"""
        work_no = get_identity()
        payload = request.form.to_dict()
        payload["cooperator"] = request.form.getlist("cooperator")
        ctrl.create_progress(duty_id, payload, submitter=work_no, files=request.files)
        return response_result()


# ─── Inline Image Upload (富文本進度說明圖片) ────────────────────────────────────

@blp.route("/progress-inline-image")
class ProgressInlineImageUploadApi(MethodView):
    @jwt_required()
    def post(self):
        """上傳進度說明富文本內嵌圖片，回傳可訪問 URL"""
        import os, uuid as _uuid
        from flask import abort
        from configs.base import BaseConfig

        file = request.files.get('image')
        if not file or not file.filename:
            abort(400)
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in {'png', 'jpg', 'jpeg', 'gif', 'webp'}:
            abort(400)
        fid = _uuid.uuid4().hex
        filename = f'{fid}.{ext}'
        save_dir = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), 'progress_inline_images')
        os.makedirs(save_dir, exist_ok=True)
        file.save(os.path.join(save_dir, filename))
        return response_result(content={'url': f'/api/temporary_duty/progress-inline-image/{filename}'})


@blp.route("/progress-inline-image/<string:filename>")
class ProgressInlineImageServeApi(MethodView):
    def get(self, filename):
        """取得進度說明富文本內嵌圖片"""
        import os
        from flask import send_file, abort
        from configs.base import BaseConfig

        if '/' in filename or '\\' in filename or '..' in filename:
            abort(400)
        save_dir = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), 'progress_inline_images')
        abs_path = os.path.join(save_dir, filename)
        if not os.path.exists(abs_path):
            abort(404)
        return send_file(abs_path, as_attachment=False)


@blp.route("/<string:duty_id>/progress/<string:progress_id>/files/<string:file_id>/preview")
class DutyProgressFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, duty_id, progress_id, file_id):
        """预览进度附件"""
        import os, json
        from flask import send_file, abort
        from dbs.mysql_db import db
        from dbs.mysql_db.model_tables import DutyProgressRecordModel
        rec = db.session.query(DutyProgressRecordModel).filter_by(id=progress_id).first()
        if not rec or not rec.files_json:
            abort(404)
        try:
            file_list = json.loads(rec.files_json)
        except Exception:
            abort(404)
        meta = next((f for f in file_list if f["id"] == file_id), None)
        if not meta:
            abort(404)
        ext = meta.get("ext", "")
        filename = f"{file_id}.{ext}" if ext else file_id
        dest_dir = ctrl._duty_progress_upload_dir(duty_id, progress_id)
        abs_path = os.path.join(dest_dir, filename)
        if not os.path.exists(abs_path):
            abort(404)
        return send_file(abs_path, download_name=meta["name"], as_attachment=False)


# ─── Review ──────────────────────────────────────────────────────────────────

@blp.route("/review_list")
class DutyReviewListApi(MethodView):
    @jwt_required()
    @blp.arguments(ReviewListQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """任务审核列表"""
        work_no = get_identity()
        return response_result(content=ctrl.get_review_list(page=query_params["page"], size=query_params["size"], work_no=work_no))


@blp.route("/review/<string:review_id>")
class DutyReviewApproveApi(MethodView):
    @jwt_required()
    @blp.arguments(ReviewApproveSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, review_id):
        """审核操作"""
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
    @blp.arguments(CountersignSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, review_id):
        """加签"""
        ctrl.countersign_review(
            review_id,
            approver_work_no=payload.get("approver_work_no", ""),
            approver_name=payload.get("approver_name", ""),
        )
        return response_result()


@blp.route("/tasklist")
class DutyTaskListApi(MethodView):
    @jwt_required()
    @blp.arguments(TaskListQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """任务清单"""
        work_no = get_identity()
        return response_result(content=ctrl.get_task_list(work_no, page=query_params["page"], size=query_params["size"]))
