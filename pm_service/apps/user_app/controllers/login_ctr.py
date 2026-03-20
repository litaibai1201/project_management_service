# -*- coding: utf-8 -*-
"""
@文件: login_controller.py
@說明:
@時間: 2024/03/06 16:02:01
@作者: LiDong
"""

import requests
from flask import current_app as app
from flask_jwt_extended import create_access_token

from configs.constant import conf
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import RoleModel, UserProfileModel, UserRoleModel


class LogInController:
    def __init__(self, payload):
        self.url_ldap = conf["user"]["url_ldap"]
        self.service_name = conf["user"]["service_name"]
        self.payload = payload

    def log_in_ad(self):
        self.payload["service_name"] = self.service_name
        headers = {"Content-Type": "application/json"}
        try:
            req = requests.post(
                self.url_ldap, headers=headers, json=self.payload
            ).json()
        except Exception as e:
            app.logger.error(e)
            req = dict()
        return req

    def _get_user_name(self, work_no: str) -> str:
        """從 UserProfileModel 查詢真實姓名，查不到則返回工號。"""
        try:
            user = (
                db.session.query(UserProfileModel)
                .filter_by(work_no=work_no, status=1)
                .first()
            )
            return user.name if user else work_no
        except Exception:
            return work_no

    def _get_user_role(self, work_no: str) -> dict:
        """從 user_role_form + role_form 查詢角色，查不到則返回空。"""
        try:
            result = (
                db.session.query(UserRoleModel, RoleModel)
                .join(RoleModel, UserRoleModel.role_code == RoleModel.code)
                .filter(UserRoleModel.work_no == work_no)
                .first()
            )
            if result:
                user_role, role = result
                return {"role_code": role.code, "role_name": role.name}
        except Exception:
            pass
        return {"role_code": None, "role_name": None}

    def get_token_payload(self) -> dict:
        work_no = self.payload["work_no"]
        name = self._get_user_name(work_no)
        role_info = self._get_user_role(work_no)

        identity = {
            "empid": work_no,
            "username": name,
            "role_code": role_info["role_code"],
            "location": self.payload["location"],
        }
        access_token = create_access_token(identity=identity)

        return {
            "access_token": access_token,
            "work_no": work_no,
            "name": name,
            "role_code": role_info["role_code"],
            "role_name": role_info["role_name"],
        }
