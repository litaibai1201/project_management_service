# -*- coding: utf-8 -*-
"""独立需求接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.standalone_req_controller import StandaloneReqController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp = Blueprint("standalone_req_api", __name__, description="独立需求管理接口")
ctrl = StandaloneReqController()


@blp.route("/list")
class ReqListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """需求列表"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.list_reqs(payload, work_no=work_no))


@blp.route("/create")
class ReqCreateApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.create_req(payload, creator=work_no))


@blp.route("/<string:req_id>")
class ReqDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, req_id):
        """更新需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.update_req(req_id, payload, work_no))

    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def delete(self, req_id):
        """删除需求"""
        work_no = get_identity()
        return response_result(content=ctrl.delete_req(req_id, work_no))
