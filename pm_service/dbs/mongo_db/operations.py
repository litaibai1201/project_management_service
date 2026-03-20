# -*- coding: utf-8 -*-
"""
@文件: operations.py
@说明: MongoDB CRUD 操作封装
@时间: 2025-09-03

使用示例:
    from dbs.mongo_db import MongoOperations

    # 创建操作实例
    users = MongoOperations("users")

    # 插入
    user_id = users.insert_one({"name": "张三", "age": 25})
    users.insert_many([{"name": "李四"}, {"name": "王五"}])

    # 查询
    user = users.find_one({"name": "张三"})
    all_users = users.find({"age": {"$gte": 18}})
    count = users.count({"age": {"$gte": 18}})

    # 更新
    users.update_one({"name": "张三"}, {"$set": {"age": 26}})
    users.update_many({"age": {"$lt": 18}}, {"$set": {"status": "minor"}})

    # 删除
    users.delete_one({"name": "张三"})
    users.delete_many({"status": "inactive"})

    # 聚合
    result = users.aggregate([
        {"$match": {"age": {"$gte": 18}}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}}
    ])
"""
from typing import Any, Dict, List, Optional, Union

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.collection import Collection
from pymongo.cursor import Cursor
from pymongo.results import (
    DeleteResult,
    InsertManyResult,
    InsertOneResult,
    UpdateResult,
)

from .client import mongo_client


class MongoOperations:
    """MongoDB 集合操作封装类

    提供常用的 CRUD 操作和聚合查询
    """

    def __init__(self, collection_name: str, database: str = None):
        """初始化

        Args:
            collection_name: 集合名称
            database: 数据库名称，为空则使用默认数据库
        """
        self._collection_name = collection_name
        self._database = database

    @property
    def collection(self) -> Collection:
        """获取集合实例"""
        return mongo_client.get_collection(self._collection_name, self._database)

    # ==================== 插入操作 ====================

    def insert_one(self, document: Dict[str, Any]) -> str:
        """插入单个文档

        Args:
            document: 文档数据

        Returns:
            插入文档的 _id (字符串)
        """
        result: InsertOneResult = self.collection.insert_one(document)
        return str(result.inserted_id)

    def insert_many(self, documents: List[Dict[str, Any]]) -> List[str]:
        """批量插入文档

        Args:
            documents: 文档列表

        Returns:
            插入文档的 _id 列表
        """
        result: InsertManyResult = self.collection.insert_many(documents)
        return [str(id_) for id_ in result.inserted_ids]

    # ==================== 查询操作 ====================

    def find_one(
        self,
        filter: Dict[str, Any] = None,
        projection: Dict[str, Any] = None,
    ) -> Optional[Dict[str, Any]]:
        """查询单个文档

        Args:
            filter: 查询条件
            projection: 字段投影 (1 显示, 0 隐藏)

        Returns:
            文档或 None
        """
        doc = self.collection.find_one(filter or {}, projection)
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return doc

    def find_by_id(self, id_: str) -> Optional[Dict[str, Any]]:
        """根据 ID 查询

        Args:
            id_: 文档 ID

        Returns:
            文档或 None
        """
        return self.find_one({"_id": ObjectId(id_)})

    def find(
        self,
        filter: Dict[str, Any] = None,
        projection: Dict[str, Any] = None,
        sort: List[tuple] = None,
        skip: int = 0,
        limit: int = 0,
    ) -> List[Dict[str, Any]]:
        """查询多个文档

        Args:
            filter: 查询条件
            projection: 字段投影
            sort: 排序规则，如 [("created_at", -1)]
            skip: 跳过条数
            limit: 限制条数 (0 表示不限制)

        Returns:
            文档列表
        """
        cursor: Cursor = self.collection.find(filter or {}, projection)

        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit:
            cursor = cursor.limit(limit)

        docs = list(cursor)
        for doc in docs:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
        return docs

    def find_page(
        self,
        filter: Dict[str, Any] = None,
        page: int = 1,
        page_size: int = 20,
        sort: List[tuple] = None,
        projection: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """分页查询

        Args:
            filter: 查询条件
            page: 页码 (从 1 开始)
            page_size: 每页条数
            sort: 排序规则
            projection: 字段投影

        Returns:
            {
                "items": [...],
                "total": 100,
                "page": 1,
                "page_size": 20,
                "total_pages": 5
            }
        """
        total = self.count(filter)
        skip = (page - 1) * page_size
        items = self.find(filter, projection, sort, skip, page_size)
        total_pages = (total + page_size - 1) // page_size

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    def count(self, filter: Dict[str, Any] = None) -> int:
        """统计文档数量

        Args:
            filter: 查询条件

        Returns:
            文档数量
        """
        return self.collection.count_documents(filter or {})

    def exists(self, filter: Dict[str, Any]) -> bool:
        """检查文档是否存在

        Args:
            filter: 查询条件

        Returns:
            是否存在
        """
        return self.collection.count_documents(filter, limit=1) > 0

    # ==================== 更新操作 ====================

    def update_one(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
    ) -> int:
        """更新单个文档

        Args:
            filter: 查询条件
            update: 更新操作 (如 {"$set": {...}})
            upsert: 不存在时是否插入

        Returns:
            修改的文档数量
        """
        result: UpdateResult = self.collection.update_one(filter, update, upsert=upsert)
        return result.modified_count

    def update_by_id(self, id_: str, update: Dict[str, Any]) -> int:
        """根据 ID 更新

        Args:
            id_: 文档 ID
            update: 更新操作

        Returns:
            修改的文档数量
        """
        return self.update_one({"_id": ObjectId(id_)}, update)

    def update_many(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
    ) -> int:
        """批量更新文档

        Args:
            filter: 查询条件
            update: 更新操作
            upsert: 不存在时是否插入

        Returns:
            修改的文档数量
        """
        result: UpdateResult = self.collection.update_many(filter, update, upsert=upsert)
        return result.modified_count

    def replace_one(
        self,
        filter: Dict[str, Any],
        replacement: Dict[str, Any],
        upsert: bool = False,
    ) -> int:
        """替换单个文档

        Args:
            filter: 查询条件
            replacement: 替换的完整文档
            upsert: 不存在时是否插入

        Returns:
            修改的文档数量
        """
        result: UpdateResult = self.collection.replace_one(
            filter, replacement, upsert=upsert
        )
        return result.modified_count

    # ==================== 删除操作 ====================

    def delete_one(self, filter: Dict[str, Any]) -> int:
        """删除单个文档

        Args:
            filter: 查询条件

        Returns:
            删除的文档数量
        """
        result: DeleteResult = self.collection.delete_one(filter)
        return result.deleted_count

    def delete_by_id(self, id_: str) -> int:
        """根据 ID 删除

        Args:
            id_: 文档 ID

        Returns:
            删除的文档数量
        """
        return self.delete_one({"_id": ObjectId(id_)})

    def delete_many(self, filter: Dict[str, Any]) -> int:
        """批量删除文档

        Args:
            filter: 查询条件

        Returns:
            删除的文档数量
        """
        result: DeleteResult = self.collection.delete_many(filter)
        return result.deleted_count

    # ==================== 聚合操作 ====================

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """聚合查询

        Args:
            pipeline: 聚合管道

        Returns:
            聚合结果列表

        示例:
            pipeline = [
                {"$match": {"status": "active"}},
                {"$group": {"_id": "$category", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
        """
        cursor = self.collection.aggregate(pipeline)
        docs = list(cursor)
        for doc in docs:
            if "_id" in doc and isinstance(doc["_id"], ObjectId):
                doc["_id"] = str(doc["_id"])
        return docs

    def distinct(self, field: str, filter: Dict[str, Any] = None) -> List[Any]:
        """获取字段的不重复值

        Args:
            field: 字段名
            filter: 查询条件

        Returns:
            不重复值列表
        """
        return self.collection.distinct(field, filter or {})

    # ==================== 索引操作 ====================

    def create_index(
        self,
        keys: Union[str, List[tuple]],
        unique: bool = False,
        **kwargs,
    ) -> str:
        """创建索引

        Args:
            keys: 索引字段，如 "name" 或 [("name", 1), ("age", -1)]
            unique: 是否唯一索引
            **kwargs: 其他索引选项

        Returns:
            索引名称
        """
        if isinstance(keys, str):
            keys = [(keys, ASCENDING)]
        return self.collection.create_index(keys, unique=unique, **kwargs)

    def create_indexes(self, indexes: List[Dict[str, Any]]) -> List[str]:
        """批量创建索引

        Args:
            indexes: 索引定义列表

        Returns:
            索引名称列表

        示例:
            indexes = [
                {"keys": [("name", 1)], "unique": True},
                {"keys": [("created_at", -1)]},
            ]
        """
        from pymongo import IndexModel

        index_models = []
        for idx in indexes:
            keys = idx.get("keys", [])
            options = {k: v for k, v in idx.items() if k != "keys"}
            index_models.append(IndexModel(keys, **options))

        return self.collection.create_indexes(index_models)

    def list_indexes(self) -> List[Dict[str, Any]]:
        """列出所有索引"""
        return list(self.collection.list_indexes())

    def drop_index(self, index_name: str) -> None:
        """删除索引"""
        self.collection.drop_index(index_name)

    def drop_indexes(self) -> None:
        """删除所有索引 (保留 _id 索引)"""
        self.collection.drop_indexes()
