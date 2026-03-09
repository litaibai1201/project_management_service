# -*- coding: utf-8 -*-
'''
@文件: setup.py
@說明:
@時間: 2025/03/28 14:09:51
@作者: LiDong
'''
import pymongo

from common.common_mongo import MongoDBHandler
from configs.constant import MONGO_CONFIG
from configs.db_config import db_config_dict
from loggers import logger

mongodb = db_config_dict["mongodb"]
host = mongodb["host"]
port = mongodb["port"]
db_name = mongodb["database_name"]
# 连接MongoDB
mongo = MongoDBHandler(
    connection_string=f"mongodb://{host}:{port}/",
    db_name=db_name,
    logger=logger
)

try:
    # 创建集合
    mongo.create_collection(
        MONGO_CONFIG["COLLECTION"],
        validator=MONGO_CONFIG["VALIDATOR"]
    )
    print("創建集合成功")
    # 创建索引
    mongo.create_index(
        MONGO_CONFIG["COLLECTION"],
        [("work_no", pymongo.ASCENDING), ("date", pymongo.DESCENDING)],
        unique=True
    )
    print("創建索引成功")
except Exception as err:
    print(f"創建集合或索引失敗: {err}")



# # 示例用法
# def example_usage():
#     """演示MongoDB操作类的基本用法"""
#     import logging

#     import pymongo

#     logger = logging.Logger("abc")

#     # 连接MongoDB
#     mongo = MongoDBHandler(
#         connection_string="mongodb://10.182.190.177:27017/",
#         db_name="project_management_test",
#         logger=logger
#     )

#     result = mongo.drop_collection("report_history_test")
#     print(1111111111, result)
# example_usage()
