# -*- coding: utf-8 -*-
'''
@文件: views.py
@說明:
@時間: 2024/06/06 16:02:49
@作者: LiDong
'''


# from flask.views import MethodView
from flask_smorest import Blueprint

blp = Blueprint("admin", __name__, url_prefix="/api/admin")
