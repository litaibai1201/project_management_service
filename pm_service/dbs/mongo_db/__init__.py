# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: MongoDB 数据库模块
@时间: 2025-09-03

使用示例:
    from dbs.mongo_db import mongo_client, MongoOperations, EnhancedMongoOperations

    # 初始化 (在 app.py 中)
    mongo_client.init_app(app)

    # 基础操作
    ops = MongoOperations("my_collection")
    ops.insert_one({"name": "test", "value": 123})
    docs = ops.find({"name": "test"})

    # 增强操作（事务、软删除、审计）
    from pydantic import BaseModel

    class UserSchema(BaseModel):
        work_no: str
        username: str

    enhanced_ops = EnhancedMongoOperations(
        "users",
        enable_soft_delete=True,
        enable_audit=True,
        schema=UserSchema
    )

    # 使用事务
    with enhanced_ops.transaction() as session:
        enhanced_ops.insert_one({"work_no": "E001", "username": "张三"}, session=session)
        enhanced_ops.update_one({"work_no": "E001"}, {"$set": {"status": 1}}, session=session)

    # 软删除
    enhanced_ops.soft_delete_one({"work_no": "E001"})
"""

from .client import MongoDBClient, mongo_client
from .operations import MongoOperations
from .enhanced_operations import EnhancedMongoOperations

__all__ = [
    "MongoDBClient",
    "mongo_client",
    "MongoOperations",
    "EnhancedMongoOperations",
]
