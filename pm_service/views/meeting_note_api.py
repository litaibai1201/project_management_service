# -*- coding: utf-8 -*-
"""会议备注接口"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from serializes.response_serialize import RspMsgRawSchema, RspMsgDictSchema
from controllers.meeting_note_controller import MeetingNoteController

blp  = Blueprint("meeting_note_api", __name__, description="会议备注接口")
ctrl = MeetingNoteController()


@blp.route("/project/<string:project_id>/meeting_notes")
class MeetingNoteListApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, project_id):
        """获取专案的所有会议备注"""
        return response_result(content=ctrl.list_by_project(project_id))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, project_id):
        """新增会议备注"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.create(project_id, payload, author=work_no))


@blp.route("/meeting_notes/<string:note_id>/status")
class MeetingNoteStatusApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, note_id):
        """切换备注状态 pending ↔ resolved"""
        work_no = get_identity()
        payload = request.get_json() or {}
        status  = payload.get("status", "resolved")
        return response_result(content=ctrl.update_status(note_id, status, operator=work_no))


@blp.route("/meeting_notes/<string:note_id>")
class MeetingNoteDeleteApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, note_id):
        """删除备注"""
        work_no = get_identity()
        ctrl.delete(note_id, operator=work_no)
        return response_result()
