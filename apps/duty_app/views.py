# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/06/06 15:52:04
@作者: LiDong
"""

from flask import request
from flask.views import MethodView
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from apps.duty_app.controllers.allocation_temporary_duty_ctr import \
    AllocationTemporaryDutyController
from apps.duty_app.controllers.create_temporary_duty_ctr import \
    CreateTemporaryDutyController
from apps.duty_app.controllers.delete_temporary_duty_ctr import (
    DeleteTemporaryDutyController, SetStatusController)
from apps.duty_app.controllers.progress_ctr import ProgressController
from apps.duty_app.controllers.review_ctr import ApplyReviewController
from apps.duty_app.controllers.search_temporary_duty_ctr import \
    SearchTemporaryDutyController
from apps.duty_app.controllers.search_temporary_duty_files_ctr import \
    SearchTemporaryDutyFilesController
from apps.duty_app.controllers.tasklist_ctr import TaskListController
from apps.duty_app.controllers.temporary_duty_list_ctr import \
    TemporaryDutyListController
from apps.duty_app.controllers.update_temporary_duty_ctr import \
    UpdateTemporaryDutyController
from apps.duty_app.controllers.upload_files_ctr import UploadFilesController
from apps.duty_app.serializes import (AllocationTemporaryDutySchema,
                                      CreateTemporaryDutySchema,
                                      ModifyProgressSchema, PageAndSizeSchema,
                                      ReviewApplySchema, TaskListSchema,
                                      TaskSetStatusSchema,
                                      TemporaryDutyListSchema,
                                      UpdateTemporaryDutySchema, UploadSchema)
from common.common_method import fail_response_result, response_data_result
from common.common_tools import CommonTools, extract_req_files
from serialize.response_serialize import (RspBaseSchema, RspMsgDictSchema,
                                          RspMsgSchema)

blp = Blueprint("temporary_duty", __name__, url_prefix="/api/temporary_duty")


@blp.route("/tasklist")
class TaskListApi(MethodView):

    @jwt_required()
    @blp.arguments(TaskListSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        tc = TaskListController()
        result = tc.get_tasklist(payload, user_id)
        return response_data_result(content=result)


@blp.route("/progress")
class ProgressApi(MethodView):

    @jwt_required()
    @blp.arguments(PageAndSizeSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        pc = ProgressController()
        result = pc.get_record_num(payload, user_id)
        return response_data_result(msg="成功查詢", content=result)


@blp.route("/<temporary_duty_id>/progress")
class DutyProgressApi(MethodView):

    @jwt_required()
    @blp.arguments(PageAndSizeSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        pc = ProgressController()
        result, flag = pc.get_duty_process_detail(payload, temporary_duty_id, user_id)
        if flag:
            return response_data_result(content=result)
        return fail_response_result(msg=result)

    @jwt_required()
    @blp.arguments(ModifyProgressSchema, location="form")
    @blp.response(200, RspMsgSchema)
    def post(self, payload, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        files_dict = extract_req_files(request.files)
        pc = ProgressController(payload, files_dict)
        result, flag = pc.update_duty_record(user_id, temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="新增記錄成功", content=result)


@blp.route("/review_list")
class ReviewListApi(MethodView):

    @jwt_required()
    @blp.arguments(PageAndSizeSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        arc = ApplyReviewController()
        result = arc.get_reviewlist(payload, user_id)
        return response_data_result(content=result)


@blp.route("/review/<review_id>")
class ReviewApplyApi(MethodView):

    @jwt_required()
    @blp.arguments(ReviewApplySchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, review_id):
        user_id = get_jwt_identity()["empid"]
        arc = ApplyReviewController()
        result, flag = arc.update_duty_review(payload, review_id, user_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg="審批成功")


@blp.route("/create_temporary_duty")
class CreateTemporaryDutyApi(MethodView):
    """
    此類用來定義/create_temporary_duty
    """

    @jwt_required()
    @blp.arguments(CreateTemporaryDutySchema, location="form")
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        user_id = get_jwt_identity()["empid"]
        files_dict = CommonTools.extract_req_files(request.files)
        ctdc = CreateTemporaryDutyController(payload, user_id, files_dict)
        result, flag = ctdc.process_create_temporary_duty()
        if not flag:
            return fail_response_result(content=payload, msg=result)
        return response_data_result(content=result, msg="成功")


@blp.route("/<string:temporary_duty_id>")
class SearchTemporaryDutyApi(MethodView):
    """
    此類用來定義临时任务详情、更新、删除及請求方式
    """

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, temporary_duty_id):
        stdc = SearchTemporaryDutyController()
        result, flag = stdc.get_temporary_duty(temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result)

    @jwt_required()
    @blp.response(200, RspBaseSchema)
    def delete(self, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        stdc = DeleteTemporaryDutyController()
        result, flag = stdc.delete_temporary_duty(user_id, temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()

    @jwt_required()
    @blp.arguments(UpdateTemporaryDutySchema, location="form")
    @blp.response(200, RspBaseSchema)
    def put(self, payload, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        files_dict = extract_req_files(request.files)
        ctdc = UpdateTemporaryDutyController(payload, user_id, files_dict)
        result, flag = ctdc.update_temporary_duty(temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/<string:temporary_duty_id>/upload_files")
class UploadTemporaryFilesApi(MethodView):
    """
    此類用來定義/<temporary_duty_id>/upload_files及請求方式
    """

    @jwt_required()
    @blp.arguments(UploadSchema, location="form")
    @blp.response(200, RspBaseSchema)
    def post(self, payload, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        files_dict = extract_req_files(request.files)
        ufc = UploadFilesController(payload, files_dict)
        result, flag = ufc.process_upload_files(user_id, temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/<string:temporary_duty_id>/files")
class SearchTemporaryDutyFilesApi(MethodView):
    """
    此類用來定義临时任务详情-文件详情接口及請求方式
    """

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, temporary_duty_id):
        stdc = SearchTemporaryDutyFilesController()
        result, flag = stdc.get_temporary_duty_files(temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result)


@blp.route("/<string:temporary_duty_id>/allocation")
class AllocationTemporaryDutyApi(MethodView):
    """
    此類用來定義临时任务分配接口及請求方式
    """

    @jwt_required()
    @blp.arguments(AllocationTemporaryDutySchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, temporary_duty_id):
        user_id = get_jwt_identity()["empid"]
        atdc = AllocationTemporaryDutyController(payload)
        result, flag = atdc.allocation_duty(user_id, temporary_duty_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/temporary_duty_list")
class TemporaryDutyListApi(MethodView):
    """
    此類用來定義临时任务列表接口及請求方式
    """

    @jwt_required()
    @blp.arguments(TemporaryDutyListSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        empid = get_jwt_identity()["empid"]
        tdlc = TemporaryDutyListController()
        data = tdlc.temporary_duty_list(empid, payload)
        return response_data_result(content=data)


@blp.route("/<string:temporary_duty_id>/set_status")
class SetStatusApi(MethodView):
    """
    此類用來定義/<temporary_duty_id>/set_status及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(TaskSetStatusSchema)
    @blp.response(200, RspBaseSchema)
    def put(self, payload, temporary_duty_id):
        empid = get_jwt_identity()["empid"]
        ssc = SetStatusController()
        result, flag = ssc.run(empid, temporary_duty_id, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)
