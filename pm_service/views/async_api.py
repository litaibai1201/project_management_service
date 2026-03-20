# -*- coding: utf-8 -*-
"""
异步接口示例

说明：Flask 3 支持 async 视图函数，生产环境请使用支持 ASGI 的服务器（如 Hypercorn/UVicorn）
此处仅作为示例，演示如何在现有代码库中添加 async endpoint
"""
import asyncio
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.response import response_result

blp = Blueprint("async_demo", __name__)


@blp.route("")
class AsyncTest(MethodView):
    async def get(self):
        """异步 GET 示例：等待 100ms 并返回简单 JSON"""
        # 示例异步操作（替换为实际异步 I/O）
        await asyncio.sleep(0.1)
        return response_result(content={"msg": "async ok"})
