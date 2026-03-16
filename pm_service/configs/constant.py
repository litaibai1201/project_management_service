# -*- coding: utf-8 -*-
"""
@文件: constant.py
@說明: 常量配置
@時間: 2023/10/19 19:03:05
@作者: LiDong
"""

from configs.const_conf import ENV, environment_dict

conf = {
    "user": {
        "service_name": "project_management_server",
        "url_ldap": "http://10.126.1.237:13570/api/ldaplogin",
    },
    "search_name": {"url": "http://10.126.1.237:13570/api/searchData"},
}

hr_info = {
    "url": "http://10.126.1.237:13570/api/searchData",
    "dep_url": "http://10.126.1.237:13570/api/searchDepData",
}

BUCKET = environment_dict["BUCKET"][ENV]


REPORT_DIR = "d:/auto/pm/report_dir/"


date_re = "^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"
MONGO_CONFIG = {
    "COLLECTION": "report_history",
    "VALIDATOR": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "work_no",
                "username",
                "date",
                "dep_nm"
            ],
            "properties": {
                "work_no": {
                    "bsonType": "string",
                    "description": "must be a string and is required"
                },
                "username": {
                    "bsonType": "string",
                    "description": "must be a string and is required"
                },
                "date": {
                    "bsonType": "string",
                    "pattern": date_re,
                    "description": "must be a string and is required"
                },
                "dep_nm": {
                    "bsonType": "string",
                    "description": "must be a string and is required"
                }
            }
        }
    },
    "INDEXS": [
        {
            "fields": [("work_no", 1), ("date", 0)],
            "unique": True
        }
    ]
}
