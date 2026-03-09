# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/06/06 16:01:27
@作者: LiDong
"""

from flask.views import MethodView
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint

from apps.search_app.controllers.search_ctr import (PathsController,
                                                    SearchController)
from apps.search_app.serializes import PathsSchema, SearchApiSchema
from common.common_method import response_data_result
from serialize.response_serialize import RspMsgDictSchema, RspMsgListSchema

blp = Blueprint("search", __name__, url_prefix="/api")


@blp.route("/search")
class SearchApi(MethodView):
    """
    此類用來定義/search及請求方式
    """

    @jwt_required()
    @blp.arguments(SearchApiSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        sc = SearchController()
        req = sc.process_search(payload)
        return response_data_result(content=req)


@blp.route("/_paths")
class PathsApi(MethodView):
    """
    此類用來定義/_paths及請求方式
    """

    def __init__(self) -> None:
        super().__init__()

    @jwt_required()
    @blp.arguments(PathsSchema)
    @blp.response(200, RspMsgListSchema)
    def post(self, payload):
        pc = PathsController()
        result = pc.run(payload)
        return response_data_result(content=result)
