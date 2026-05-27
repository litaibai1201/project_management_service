# -*- coding: utf-8 -*-
"""项目管理接口 Blueprint"""
from flask import request, send_file
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.project_controller import ProjectController, FunctionController, MilestoneController
from controllers.requirement_controller import RequirementController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp = Blueprint("project_api", __name__, description="项目管理接口")
proj_ctrl = ProjectController()
func_ctrl = FunctionController()
mile_ctrl = MilestoneController()
req_ctrl  = RequirementController()


# ─── Project ─────────────────────────────────────────────────────────────────

@blp.route("/project_list")
class ProjectListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """项目列表"""
        payload = request.get_json() or {}
        return response_result(content=proj_ctrl.list_projects(payload))


@blp.route("/create_project")
class ProjectCreateApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建项目"""
        work_no = get_identity()
        payload = request.form.to_dict()
        files = request.files
        return response_result(content=proj_ctrl.create_project(payload, creator=work_no))


@blp.route("/<string:project_id>")
class ProjectDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        """获取项目详情"""
        work_no = get_identity()
        return response_result(content=proj_ctrl.get_project(project_id, operator=work_no))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id):
        """更新项目"""
        work_no = get_identity()
        payload = request.form.to_dict()
        proj_ctrl.update_project(project_id, payload, operator=work_no)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id):
        """删除项目"""
        proj_ctrl.delete_project(project_id)
        return response_result()


@blp.route("/<string:project_id>/set_project_pm")
class ProjectSetProjectPmApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id):
        """设定专案PM（规划中阶段，专案PM为空时由创建人/产品PM操作）"""
        work_no = get_identity()
        payload = request.get_json() or {}
        proj_ctrl.set_project_pm(project_id, payload.get("project_pm", ""), operator=work_no)
        return response_result()


@blp.route("/<string:project_id>/set_status")
class ProjectSetStatusApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id):
        """设置项目状态"""
        payload = request.get_json() or {}
        proj_ctrl.set_status(project_id, payload["status"])
        return response_result()


@blp.route("/<string:project_id>/change_request")
class ProjectChangeRequestApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """提交需求变更申请"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=proj_ctrl.submit_change_request(
            project_id,
            reviewer=payload.get("reviewer", []),
            description=payload.get("description", ""),
            submitter=work_no,
        ))


@blp.route("/<string:project_id>/submit_for_review")
class ProjectSubmitReviewApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """提交审核"""
        work_no = get_identity()
        payload = request.get_json() or {}
        proj_ctrl.submit_for_review(
            project_id,
            reviewer=payload.get("reviewer", []),
            status=payload.get("status"),
            submitter=work_no,
        )
        return response_result()


@blp.route("/<string:project_id>/is_finished")
class ProjectFinishApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id):
        """完结项目"""
        proj_ctrl.set_status(project_id, 4)  # 4=已完结
        return response_result()


@blp.route("/<string:project_id>/restart")
class ProjectRestartApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """重启项目"""
        proj_ctrl.set_status(project_id, 1)  # 1=进行中
        return response_result()


@blp.route("/<string:project_id>/gantt_chart")
class GanttChartApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        """获取甘特图数据"""
        return response_result(content=proj_ctrl.get_gantt_chart(project_id))


@blp.route("/<string:project_id>/member_dynamics")
class MemberDynamicsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        """获取成员动态"""
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=proj_ctrl.get_member_dynamics(project_id, page=page, size=size))


@blp.route("/<string:project_id>/files")
class ProjectFilesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, project_id):
        """获取项目附件列表"""
        return response_result(content=proj_ctrl.list_project_files(project_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """上传项目附件"""
        work_no = get_identity()
        file = request.files.get("file")
        if not file or not file.filename:
            from utils.exceptions import ValidationException
            raise ValidationException(msg="请选择要上传的文件")
        file_category = request.form.get("file_category", "other")
        return response_result(content=proj_ctrl.upload_project_file(project_id, file, uploader=work_no, file_category=file_category))


@blp.route("/<string:project_id>/files/<string:file_id>")
class ProjectFileDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id, file_id):
        """删除项目附件"""
        work_no = get_identity()
        proj_ctrl.delete_project_file(project_id, file_id, operator=work_no)
        return response_result()


@blp.route("/<string:project_id>/files/<string:file_id>/download")
class ProjectFileDownloadApi(MethodView):
    @jwt_required()
    def get(self, project_id, file_id):
        """下载项目附件"""
        abs_path, original_name = proj_ctrl.get_project_file_path(project_id, file_id)
        return send_file(abs_path, as_attachment=True, download_name=original_name)


@blp.route("/<string:project_id>/files/<string:file_id>/preview")
class ProjectFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, project_id, file_id):
        """内联预览项目附件（不强制下载）"""
        import mimetypes
        abs_path, original_name = proj_ctrl.get_project_file_path(project_id, file_id)
        ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        text_exts = {"txt", "md", "yaml", "yml", "csv"}
        if ext in text_exts:
            mime_type = "text/plain; charset=utf-8"
        else:
            mime_type, _ = mimetypes.guess_type(original_name)
            mime_type = mime_type or "application/octet-stream"
        return send_file(abs_path, mimetype=mime_type, as_attachment=False, download_name=original_name)


@blp.route("/<string:project_id>/progress_and_hour")
class ProgressAndHourApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        """获取进度与工时"""
        return response_result(content=proj_ctrl.get_progress_and_hour(project_id))


@blp.route("/project_group")
class ProjectGroupApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取项目分组"""
        return response_result(content=proj_ctrl.get_project_groups())


@blp.route("/report_stats")
class ProjectReportStatsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """專案進度報表統計"""
        return response_result(content=proj_ctrl.get_report_stats())


@blp.route("/member_report_stats")
class MemberReportStatsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """成員報表統計"""
        return response_result(content=proj_ctrl.get_member_report_stats())


@blp.route("/wbs_overview")
class WbsOverviewApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """专案进度总览（WBS 结构）"""
        work_no = get_identity()
        return response_result(content=proj_ctrl.get_wbs_overview(work_no))


# ─── Function ────────────────────────────────────────────────────────────────

@blp.route("/<string:project_id>/add_function")
class AddFunctionApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """添加功能任务"""
        work_no = get_identity()
        payload = request.form.to_dict()
        return response_result(content=func_ctrl.add_function(project_id, payload, creator=work_no))


@blp.route("/<string:project_id>/function/<string:function_id>")
class FunctionDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id, function_id):
        """获取功能任务详情"""
        return response_result(content=func_ctrl.get_function(function_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id, function_id):
        """更新功能任务"""
        payload = request.form.to_dict()
        func_ctrl.update_function(function_id, payload)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id, function_id):
        """删除功能任务"""
        func_ctrl.delete_function(function_id)
        return response_result()


@blp.route("/<string:project_id>/function/<string:function_id>/reschedule")
class FunctionRescheduleApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, function_id):
        """延期任务（保留原始日期，更新最新预计完成时间）"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=func_ctrl.reschedule_function(
            function_id,
            new_end_date=payload.get("new_end_date", ""),
            reason=payload.get("reason", ""),
            operator=work_no,
        ))


@blp.route("/<string:project_id>/function/<string:function_id>/submit_completion")
class FunctionSubmitCompletionApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, function_id):
        """提交任务完结审核"""
        work_no = get_identity()
        result = func_ctrl.submit_function_completion(project_id, function_id, submitter=work_no)
        return response_result(content=result)


@blp.route("/<string:project_id>/function/<string:function_id>/set_status")
class FunctionSetStatusApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id, function_id):
        """设置功能任务状态"""
        payload = request.get_json() or {}
        func_ctrl.set_status(function_id, payload["status"])
        return response_result()


@blp.route("/<string:project_id>/function/<string:function_id>/allocation")
class FunctionAllocationApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id, function_id):
        """分配功能任务"""
        payload = request.get_json() or {}
        func_ctrl.allocate(function_id, payload)
        return response_result()


@blp.route("/my_functions")
class MyFunctionsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """查询当前用户作为负责人的所有跨专案功能任务"""
        work_no = get_identity()
        page    = int(request.args.get("page", 1))
        size    = int(request.args.get("size", 20))
        status  = request.args.get("status")
        status  = int(status) if status is not None else None
        scope   = request.args.get("scope", "all")
        return response_result(content=func_ctrl.my_functions(work_no, page=page, size=size, status=status, scope=scope))


@blp.route("/<string:project_id>/function_list")
class FunctionListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """功能任务列表"""
        payload = request.get_json() or {}
        return response_result(content=func_ctrl.list_functions(project_id, payload))


# ─── Progress ────────────────────────────────────────────────────────────────

@blp.route("/<string:project_id>/function/<string:function_id>/progress")
class FunctionProgressApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id, function_id):
        """获取功能任务进度"""
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        unread = request.args.get("unread")
        return response_result(content=func_ctrl.get_progress(
            function_id, page=page, size=size,
            unread=int(unread) if unread else 0,
        ))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, function_id):
        """创建功能任务进度"""
        work_no = get_identity()
        payload = request.form.to_dict()
        payload["cooperator"] = request.form.getlist("cooperator")
        return response_result(content=func_ctrl.create_progress(
            project_id, function_id, payload, submitter=work_no, files=request.files,
        ))


@blp.route("/<string:project_id>/function/<string:function_id>/progress/<string:progress_id>/files/<string:file_id>/preview")
class ProgressFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, project_id, function_id, progress_id, file_id):
        """内联预览进度附件"""
        import mimetypes
        abs_path, original_name = func_ctrl.get_progress_file_path(project_id, progress_id, file_id)
        ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        text_exts = {"txt", "md", "yaml", "yml", "csv"}
        if ext in text_exts:
            mime_type = "text/plain; charset=utf-8"
        else:
            mime_type, _ = mimetypes.guess_type(original_name)
            mime_type = mime_type or "application/octet-stream"
        return send_file(abs_path, mimetype=mime_type, as_attachment=False, download_name=original_name)


@blp.route("/<string:project_id>/function/<string:function_id>/progress/<string:progress_id>/files/<string:file_id>/download")
class ProgressFileDownloadApi(MethodView):
    @jwt_required()
    def get(self, project_id, function_id, progress_id, file_id):
        """下载进度附件"""
        abs_path, original_name = func_ctrl.get_progress_file_path(project_id, progress_id, file_id)
        return send_file(abs_path, as_attachment=True, download_name=original_name)


# ─── Review ──────────────────────────────────────────────────────────────────

@blp.route("/review_list")
class ReviewListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """项目审核列表"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=proj_ctrl.get_review_list(page=page, size=size, work_no=work_no))


@blp.route("/my_submitted_reviews")
class MySubmittedReviewsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """我提交的审核记录（提交人视角）"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 50))
        return response_result(content=proj_ctrl.get_my_submitted_reviews(page=page, size=size, work_no=work_no))


@blp.route("/all_reviews")
class AllReviewsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """全部审核（项目+任务）"""
        work_no = get_identity()
        return response_result(content=proj_ctrl.get_all_reviews(work_no=work_no))


@blp.route("/review/<string:review_id>")
class ReviewApproveApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, review_id):
        """审核操作"""
        payload = request.get_json() or {}
        proj_ctrl.approve_review(
            review_id,
            status=payload.get("status"),
            reject_reason=payload.get("reject_reason", ""),
            countersigns=payload.get("countersigns", []),
            approver_work_no=get_identity(),
        )
        return response_result()


@blp.route("/review/<string:review_id>/countersign")
class ReviewCountersignApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, review_id):
        """加签"""
        payload = request.get_json() or {}
        proj_ctrl.countersign_review(
            review_id,
            approver_work_no=payload.get("approver_work_no", ""),
            approver_name=payload.get("approver_name", ""),
        )
        return response_result()


# ─── Milestone ───────────────────────────────────────────────────────────────

@blp.route("/<string:project_id>/milestones")
class MilestoneListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, project_id):
        """获取里程碑列表"""
        return response_result(content=mile_ctrl.list_milestones(project_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """创建里程碑"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=mile_ctrl.create_milestone(project_id, payload, creator=work_no))


@blp.route("/<string:project_id>/milestones/<string:milestone_id>")
class MilestoneDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id, milestone_id):
        """更新里程碑"""
        payload = request.get_json() or {}
        mile_ctrl.update_milestone(milestone_id, payload)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id, milestone_id):
        """删除里程碑"""
        mile_ctrl.delete_milestone(milestone_id)
        return response_result()


# ─── Requirements ─────────────────────────────────────────────────────────────

@blp.route("/<string:project_id>/requirements")
class RequirementListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, project_id):
        """获取专案需求列表"""
        return response_result(content=req_ctrl.get_requirements(project_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """新增需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=req_ctrl.create_requirement(project_id, payload, creator=work_no))


@blp.route("/<string:project_id>/requirements/<string:req_id>")
class RequirementDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id, req_id):
        """获取需求详情"""
        return response_result(content=req_ctrl.get_requirement(req_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, project_id, req_id):
        """更新需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=req_ctrl.update_requirement(req_id, payload, operator=work_no))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id, req_id):
        """删除需求"""
        work_no = get_identity()
        req_ctrl.delete_requirement(req_id, operator=work_no)
        return response_result()


@blp.route("/<string:project_id>/requirements/<string:req_id>/submit_review")
class RequirementSubmitReviewApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, req_id):
        """提交需求审核"""
        work_no = get_identity()
        payload = request.get_json() or {}
        reviewer = payload.get("reviewer", [])
        return response_result(content=req_ctrl.submit_review(req_id, reviewer=reviewer, operator=work_no))


@blp.route("/<string:project_id>/requirements/batch_review")
class RequirementBatchReviewApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """批量提交需求审核（创建单一审核单）"""
        work_no = get_identity()
        payload = request.get_json() or {}
        requirement_ids = payload.get("requirement_ids", [])
        reviewer = payload.get("reviewer", [])
        return response_result(content=req_ctrl.batch_submit_review(
            project_id, requirement_ids=requirement_ids, reviewer=reviewer, operator=work_no
        ))


@blp.route("/<string:project_id>/functions/task_addition_review")
class TaskAdditionReviewApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """提交執行階段新增任務的審核（批量，創建單一審核單）"""
        work_no = get_identity()
        payload = request.get_json() or {}
        function_ids = payload.get("function_ids", [])
        reviewer = payload.get("reviewer", [])
        return response_result(content=func_ctrl.submit_task_review(
            project_id, function_ids=function_ids, reviewer=reviewer, operator=work_no
        ))


@blp.route("/<string:project_id>/requirements/<string:req_id>/shelve")
class RequirementShelveApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, req_id):
        """提交需求搁置审核"""
        work_no = get_identity()
        payload = request.get_json() or {}
        reviewer = payload.get("reviewer", [])
        return response_result(content=req_ctrl.submit_shelve(req_id, reviewer=reviewer, operator=work_no))


@blp.route("/<string:project_id>/requirements/<string:req_id>/files")
class RequirementFilesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id, req_id):
        """上传需求附件"""
        work_no = get_identity()
        file = request.files.get("file")
        if not file or not file.filename:
            from utils.exceptions import ValidationException
            raise ValidationException(msg="请选择要上传的文件")
        return response_result(content=req_ctrl.upload_file(req_id, file, uploader=work_no))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, project_id, req_id):
        """删除需求附件记录"""
        payload = request.get_json() or {}
        file_url = payload.get("url", "")
        files = req_ctrl.remove_file(req_id, file_url)
        return response_result(content={"files": files})


@blp.route("/<string:project_id>/requirements/<string:req_id>/files/<string:file_id>/preview")
class RequirementFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, project_id, req_id, file_id):
        """預覽需求附件"""
        import mimetypes
        abs_path, original_name = req_ctrl.get_req_file_path(req_id, file_id)
        ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if ext in ("jpg", "jpeg", "png", "gif", "webp", "bmp"):
            mime_type = f"image/{ext.replace('jpg', 'jpeg')}"
        else:
            mime_type, _ = mimetypes.guess_type(original_name)
            mime_type = mime_type or "application/octet-stream"
        return send_file(abs_path, mimetype=mime_type, as_attachment=False, download_name=original_name)


@blp.route("/<string:project_id>/requirements/<string:req_id>/files/<string:file_id>/download")
class RequirementFileDownloadApi(MethodView):
    @jwt_required()
    def get(self, project_id, req_id, file_id):
        """下載需求附件"""
        abs_path, original_name = req_ctrl.get_req_file_path(req_id, file_id)
        return send_file(abs_path, as_attachment=True, download_name=original_name)
