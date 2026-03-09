# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/03/06 11:23:26
@作者: LiDong
"""


from apps.admin_app.views import blp as admin_blp
from apps.duty_app.views import blp as duty_blp
from apps.group_app.views import blp as group_blp
from apps.project_app.views import blp as project_blp
from apps.search_app.views import blp as search_blp
from apps.user_app.views import blp as user_blp


def register_blp(api):
    """藍圖註冊"""
    api.register_blueprint(admin_blp)
    api.register_blueprint(duty_blp)
    api.register_blueprint(group_blp)
    api.register_blueprint(project_blp)
    api.register_blueprint(search_blp)
    api.register_blueprint(user_blp)
