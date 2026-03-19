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

    def get_token_payload(self):
        user_info = {
            "empid": self.payload["work_no"],
            "username": '李栋',
            # "role": "L2300045",
            "location": self.payload["location"],
        }
        payload = create_access_token(identity=user_info)
        return payload
