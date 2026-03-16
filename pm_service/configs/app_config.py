# -*- coding: utf-8 -*-
"""
@文件: app_config.py
@說明: 增加 SQLALCHEMY_DATABASE_TEST_URI 的配置
@時間: 2023/10/27 08:36:31
@作者: LiaoHengYi
"""


from configs.db_config import db_config_dict

SQLALCHEMY_DATABASE_URI = "mysql+pymysql://{}:{}@{}:{}/{}?charset=utf8".format(
    db_config_dict["project_management_db"]["username"],
    db_config_dict["project_management_db"]["password"],
    db_config_dict["project_management_db"]["host"],
    db_config_dict["project_management_db"]["port"],
    db_config_dict["project_management_db"]["database_name"],
)


REDIS_DATABASE_URI = "redis://{}:{}@{}:{}/{}".format(
    db_config_dict["redis"]["username"],
    db_config_dict["redis"]["password"],
    db_config_dict["redis"]["host"],
    db_config_dict["redis"]["port"],
    db_config_dict["redis"]["database_name"],
)
