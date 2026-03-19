# -*- coding: utf-8 -*-
"""
@文件: db_config.py
@說明: db配置
@時間: 2023/10/19 19:03:19
@作者: LiDong
"""


from configs import secrets
from configs.const_conf import ENV, environment_dict

db_account = secrets.db_account


db_config_dict = {
    "project_management_db": {
        "host": "localhost",
        # "host": "10.182.190.176",
        # "host": "10.126.1.128",
        "port": "3306",
        "database_name": environment_dict["DB"][ENV],
        "username": db_account["mysql_db"]["username"],
        "password": db_account["mysql_db"]["password"],
    },
    "redis": {
        "host": "localhost",
        # "host": "10.126.1.128",
        "port": "6379",
        "database_name": "0",
        "username": db_account["redis"]["username"],
        "password": db_account["redis"]["password"],
    },
    "minio": {
        "host": "localhost",
        # "host": "10.126.1.128",
        "port": "9000",
        "database_name": "",
        "username": db_account["minio"]["username"],
        "password": db_account["minio"]["password"],
    },
    "mongodb": {
        "host": "localhost",
        # "host": "10.182.190.177",
        "port": "27017",
        "database_name": "project_management",
        "username": "",
        "password": ""
    }
}
