# -*- coding: utf-8 -*-
"""搜索接口 Blueprint"""
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required
from utils.response import response_result
from controllers.search_controller import SearchController
from serializes.response_serialize import RspMsgDictSchema
from serializes.search_serialize import SearchSchema, PathResolveSchema

blp = Blueprint("search_api", __name__, description="全局搜索接口")
ctrl = SearchController()


@blp.route("/search")
class SearchApi(MethodView):
    @jwt_required()
    @blp.arguments(SearchSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """全局搜索"""
        return response_result(content=ctrl.search(
            keyword=payload.get("keyword", ""),
            search_type=payload.get("type"),
            page=payload.get("page", 1),
            size=payload.get("size", 20),
        ))


@blp.route("/_paths")
class PathsApi(MethodView):
    @jwt_required()
    @blp.arguments(PathResolveSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """批量解析路径"""
        ids = payload.get("ids", [])
        return response_result(content=ctrl.resolve_paths(ids))
