# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/07/19 10:07:15
@作者: LiDong
"""


from flask import request
from flask.views import MethodView
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from apps.project_app.controllers.add_function_ctr import AddFunctionController
from apps.project_app.controllers.create_project_ctr import \
    CreateProjectController
from apps.project_app.controllers.delete_project_ctr import \
    DeleteProjectController
from apps.project_app.controllers.function_ctr import (
    FunctionAllocationController, FunctionDeleteController,
    FunctionDetailsController, FunctionSetStatusController,
    FunctionUpdateController)
from apps.project_app.controllers.obtain_group_name_ctr import (
    ObtainFunctionGroupController, ObtainPojectGroupController)
from apps.project_app.controllers.progress_ctr import (
    CreateProgressController, ProgressDataController)
from apps.project_app.controllers.project_ctr import (
    ProFunProgressRecordController, ProjectDetailsController,
    ProjectFileNumController, ProjectFilesController, ProjectFinishController,
    ProjectFunctionListController, ProjectGanttChartController,
    ProjectListController, ProjectMemberDynamicsController,
    ProjectProgressAndHourController, ProjectRestartController,
    ProjectReviewIdController, ProjectReviewListController,
    ProjectTaskListController, ProProgressRecordController,
    SetStatusController)
from apps.project_app.controllers.submit_for_review_ctr import \
    SubmitForReviewController
from apps.project_app.controllers.update_project_ctr import \
    UpdateProjectController
from apps.project_app.controllers.upload_files_ctr import UploadFilesController
from apps.project_app.controllers.upload_files_fun_ctr import \
    UploadFilesFunctionController
from apps.project_app.serializes import (AddFunctionSchema,
                                         CreateProgressSchema,
                                         CreateUpdateProjectSchema,
                                         ProgressDataSchema,
                                         ProjectApprovalSchema,
                                         ProjectFunctionListSchema,
                                         ProjectListSchema,
                                         ProjectReviewSchema,
                                         ProjectTaskListSchema,
                                         SetStatusSchema,
                                         SubmitForReviewSchema,
                                         TaskAllocationSchema,
                                         TaskSetStatusSchema,
                                         UpdateFunctionSchema,
                                         UploadFunctionFileSchema,
                                         UploadSchema)
from common.common_method import fail_response_result, response_data_result
from common.common_tools import extract_req_files
from serialize.response_serialize import (RspBaseSchema, RspIntSchema,
                                          RspMsgDictSchema, RspMsgListSchema,
                                          RspMsgSchema)

blp = Blueprint("project", __name__, url_prefix="/api/project")


@blp.route("/create_project")
class CreatePojectApi(MethodView):
    """
    此類用來定義/create_project及請求方式
    """

    @jwt_required()
    @blp.arguments(CreateUpdateProjectSchema, location="form")
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        empid = get_jwt_identity()["empid"]
        files_dict = extract_req_files(request.files)
        cpc = CreateProjectController(payload, empid, files_dict)
        result, flag = cpc.process_create_project()
        if not flag:
            return fail_response_result(content=payload, msg=result)
        return response_data_result(content=result)


@blp.route("/<string:project_id>")
class ProjectApi(MethodView):
    """
    此類用來定義/<project_id>及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        pdc = ProjectDetailsController()
        result, flag = pdc.get_project_details(project_id)
        if not flag:
            return response_data_result(msg=result)
        return response_data_result(msg="專案詳情查詢成功", content=result)

    @jwt_required()
    @blp.response(200, RspBaseSchema)
    def delete(self, project_id):
        empid = get_jwt_identity()["empid"]
        dpc = DeleteProjectController(project_id, empid)
        result, flag = dpc.process_delete_project()
        if not flag:
            return fail_response_result(msg=result)
        else:
            return response_data_result()

    @jwt_required()
    @blp.arguments(CreateUpdateProjectSchema, location="form")
    @blp.response(200, RspBaseSchema)
    def put(self, payload, project_id):
        user_id = get_jwt_identity()["empid"]
        files_dict = extract_req_files(request.files)
        upc = UpdateProjectController(payload, user_id, files_dict, project_id)
        result, flag = upc.process_update_project()
        if flag:
            return response_data_result()
        return fail_response_result(payload, msg=result)


@blp.route("/<string:project_id>/upload_files")
class UploadFilesApi(MethodView):
    """
    此類用來定義/<project_id>/upload_files及請求方式
    """

    @jwt_required()
    @blp.arguments(UploadSchema, location="form")
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, project_id):
        files_dict = extract_req_files(request.files)
        ufc = UploadFilesController(payload, project_id, files_dict)
        result, flag = ufc.process_upload_files()
        if flag:
            return response_data_result()
        return fail_response_result(payload, msg=result)


@blp.route("/<string:project_id>/function/<string:function_id>/upload_files")
class UploadFunctionFilesApi(MethodView):
    """
    此類用來定義/<project_id>/upload_files及請求方式
    """

    @jwt_required()
    @blp.arguments(UploadFunctionFileSchema, location="form")
    @blp.response(200, RspBaseSchema)
    def post(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        uffc = UploadFilesFunctionController()
        files_dict = extract_req_files(request.files)
        result, flag = uffc.upload_function_files(
            empid, project_id, function_id, files_dict
        )
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/<string:project_id>/add_function")
class AddFunctionApi(MethodView):
    """
    此類用來定義/<project_id>/add_function及請求方式
    """

    @jwt_required()
    @blp.arguments(AddFunctionSchema, location="form")
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, project_id):
        empid = get_jwt_identity()["empid"]
        afc = AddFunctionController()
        files_dict = extract_req_files(request.files)
        result, flag = afc.process_add_function(payload, project_id, files_dict, empid)
        if not flag:
            return fail_response_result(content=payload, msg=result)
        return response_data_result(msg=result)


@blp.route("/<string:project_id>/function/<string:function_id>")
class FunctionApi(MethodView):
    """
    此類用來定義/<project_id>/function/<function_id>及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id, function_id):
        fdc = FunctionDetailsController()
        content, flag = fdc.query_task_details(project_id, function_id)
        if not flag:
            return fail_response_result(msg=content)
        return response_data_result(msg="查詢成功", content=content)

    @jwt_required()
    @blp.response(200, RspBaseSchema)
    def delete(self, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        FDC = FunctionDeleteController()
        result, flag = FDC.delete_function(empid, project_id, function_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="功能刪除成功")

    def __get_file_dict(self):
        file_dict = {}
        for key in request.files:
            file_dict[key] = request.files.getlist(key)
        return file_dict

    @jwt_required()
    @blp.arguments(UpdateFunctionSchema, location="form")
    @blp.response(200, RspBaseSchema)
    def put(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        FUC = FunctionUpdateController()
        fdict = self.__get_file_dict()
        rsult, flag = FUC.update_function(
            empid, fdict, project_id, function_id, payload
        )
        if not flag:
            return fail_response_result(msg=rsult)
        return response_data_result(msg=rsult)


@blp.route("/<string:project_id>/function/<string:function_id>/set_status")
class SetFuncStatusApi(MethodView):
    """
    此類用來定義/<project_id>/function/<function_id>/set_status及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(TaskSetStatusSchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        fssc = FunctionSetStatusController()
        result, flag = fssc.run(empid, project_id, function_id, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="任務派發成功")


@blp.route("/<string:project_id>/function/<string:function_id>/allocation")
class TaskAllocationApi(MethodView):
    """
    此類用來定義/<project_id>/function/<function_id>/allocation及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(TaskAllocationSchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        FAC = FunctionAllocationController()
        result, flag = FAC.task_distribution(empid, project_id, function_id, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="任務派發成功")


@blp.route("/<string:project_id>/function/<string:function_id>/progress")
class ProgressApi(MethodView):
    """
    此類用來定義/<project_id>/function/<function_id>/progress及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    def __get_file_dict(self):
        file_dict = {}
        for key in request.files:
            file_dict[key] = request.files.getlist(key)
        return file_dict

    @jwt_required()
    @blp.arguments(CreateProgressSchema, location="form")
    @blp.response(200, RspMsgSchema)
    def post(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        cpf = CreateProgressController()
        fdict = self.__get_file_dict()
        result, flag = cpf.create_progress(
            payload, project_id, function_id, empid, fdict
        )
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="新增記錄成功", content=result)

    @jwt_required()
    @blp.arguments(ProgressDataSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, project_id, function_id):
        empid = get_jwt_identity()["empid"]
        pdc = ProgressDataController()
        content = pdc.get_progress_datas(payload, empid, function_id)
        return response_data_result(content=content)


@blp.route("/<string:project_id>/is_finished")
class IsFinishedApi(MethodView):
    """
    此類用來定義/<project_id>/is_finished及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspBaseSchema)
    def put(self, project_id):
        empid = get_jwt_identity()["empid"]
        PFC = ProjectFinishController()
        result, flag = PFC.finish_project(empid, project_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/<string:project_id>/set_status")
class SetStatusApi(MethodView):
    """
    此類用來定義/<project_id>/set_status及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(SetStatusSchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, project_id):
        empid = get_jwt_identity()["empid"]
        ssc = SetStatusController()
        result, flag = ssc.run(empid, project_id, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/<string:project_id>/restart")
class RestartApi(MethodView):
    """
    此類用來定義/<project_id>/restart及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        empid = get_jwt_identity()["empid"]
        prc = ProjectRestartController()
        result, flag = prc.restart_project(empid, project_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="專案重啟成功")


@blp.route("/project_list")
class ProjectListApi(MethodView):
    """
    此類用來定義/project_list及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectListSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        empid = get_jwt_identity()["empid"]
        PLC = ProjectListController()
        result, flag = PLC.search_project_list(empid, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="成功查詢", content=result)


@blp.route("/<string:project_id>/progress_and_hour")
class ProjectProgressAndHourApi(MethodView):
    """
    此類用來定義/<project_id>/progress_and_hour及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        PLHC = ProjectProgressAndHourController()
        data = PLHC.run(project_id)
        return response_data_result(msg="成功查詢", content=data)


@blp.route("/<string:project_id>/file_num")
class ProjectFileNumApi(MethodView):
    """
    此類用來定義/<project_id>/file_num及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspIntSchema)
    def get(self, project_id):
        pfnc = ProjectFileNumController()
        data = pfnc.get_file_num(project_id)
        return response_data_result(msg="成功查詢", content=str(data))


@blp.route("/<string:project_id>/function_list")
class ProjectTaskListApi(MethodView):
    """
    此類用來定義/<string:project_id>/function_list及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectTaskListSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, project_id):
        ptlc = ProjectTaskListController()
        empid = get_jwt_identity()["empid"]
        content, flag = ptlc.search_project_task_list(
            payload, project_id, empid
        )
        if not flag:
            return fail_response_result(msg=content)
        return response_data_result(msg="成功查詢", content=content)


@blp.route("/review_list")
class ProjectReviewListApi(MethodView):
    """
    此類用來定義/review_list及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectReviewSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        prlc = ProjectReviewListController()
        data_dict = prlc.get_apply_record(payload, empid)
        return response_data_result(msg="成功查詢", content=data_dict)


@blp.route("/review/<string:review_id>")
class ProjectReviewDetailApi(MethodView):
    """
    此類用來定義/review/<string:review_id>及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectApprovalSchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, review_id):
        empid = get_jwt_identity()["empid"]
        PRC = ProjectReviewIdController()
        result, flag = PRC.approval_review(payload, review_id, empid)
        if flag:
            return response_data_result(msg="審批成功")
        return fail_response_result(msg=result)


@blp.route("/<string:project_id>/gantt_chart")
class ProjectGanttChartApi(MethodView):
    """
    此類用來定義/<string:project_id>/gantt_chart及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgListSchema)
    def get(self, project_id):
        PGC = ProjectGanttChartController()
        gantt_chart_list = PGC.gantt_chart(project_id)
        return response_data_result(msg="查询成功", content=gantt_chart_list)


@blp.route("/<string:project_id>/member_dynamics")
class ProjectMemberDynamicsApi(MethodView):
    """
    此類用來定義/<string:project_id>/member_dynamics
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectReviewSchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload, project_id):
        PMD = ProjectMemberDynamicsController()
        member_dynamics_list = PMD.member_dynamics(project_id, payload)
        return response_data_result(msg="查询成功", content=member_dynamics_list)


@blp.route("/<string:project_id>/files")
class ProjectFilesApi(MethodView):
    """
    此類用來定義/<string:project_id>/files
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        PFC = ProjectFilesController()
        datalist_dic = PFC.files_message(project_id)
        return response_data_result(msg="查询成功", content=datalist_dic)


@blp.route("/progress")
class ProgressProjectRecordApi(MethodView):
    """
    此類用來定義/progress及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectReviewSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        content = ProProgressRecordController().project_record(empid, payload)
        return response_data_result(msg="成功查詢", content=content)


@blp.route("/<string:project_id>/function/progress")
class ProjectFunctionProgressApi(MethodView):
    """
    此類用來定義/<string:project_id>/function/progress
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectReviewSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, project_id):
        PRC = ProFunProgressRecordController()
        empid = get_jwt_identity()["empid"]
        content = PRC.pro_fun_record(payload, empid, project_id)
        return response_data_result(msg="成功查詢", content=content)


@blp.route("/tasklist")
class ProjectFunctionListApi(MethodView):
    """
    此類用來定義/tasklist及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(ProjectFunctionListSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        empid = get_jwt_identity()["empid"]
        pflc = ProjectFunctionListController()
        data = pflc.search_projects_n_funs(payload, empid)
        return response_data_result(msg="成功查詢", content=data)


@blp.route("/<string:project_id>/submit_for_review")
class SubmitForReviewApi(MethodView):
    """
    此類用來定義/submit_for_review及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(SubmitForReviewSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload, project_id):
        empid = get_jwt_identity()["empid"]
        sfrc = SubmitForReviewController(payload, empid)
        result, flag = sfrc.submit_for_review(project_id)
        if not flag:
            return fail_response_result(content=payload, msg=result)
        return response_data_result()


@blp.route("/project_group")
class ObtainPojectGroupApi(MethodView):
    """
    此類用來定義/project_group
    """

    def __init__(self) -> None:
        super().__init__()
        self.opgc = ObtainPojectGroupController()

    @jwt_required()
    @blp.response(200, RspMsgListSchema)
    def get(self):
        data = self.opgc.obtain_project_group()
        return response_data_result(msg="成功查詢", content=data)


@blp.route("/<string:project_id>/function_group")
class ObtainFunctionGroupApi(MethodView):
    """
    此類用來定義/function_group
    """

    def __init__(self) -> None:
        super().__init__()
        self.ofgc = ObtainFunctionGroupController()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, project_id):
        data = self.ofgc.obtain_function_group(project_id)
        return response_data_result(msg="成功查詢", content=data)
