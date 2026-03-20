# -*- coding: utf-8 -*-
"""搜索接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required
from utils.response import response_result
from controllers.search_controller import SearchController
from serializes.response_serialize import RspMsgDictSchema

blp = Blueprint("search_api", __name__, description="全局搜索接口")
ctrl = SearchController()


@blp.route("/search")
class SearchApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """全局搜索"""
        payload = request.get_json() or {}
        return response_result(content=ctrl.search(
            keyword=payload.get("keyword", ""),
            search_type=payload.get("type"),
            page=payload.get("page", 1),
            size=payload.get("size", 20),
        ))


@blp.route("/_paths")
class PathsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """批量解析路径"""
        payload = request.get_json() or {}
        ids = payload.get("ids", [])
        return response_result(content=ctrl.resolve_paths(ids))
