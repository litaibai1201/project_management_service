# -*- coding: utf-8 -*-
'''
@文件: common_mongo.py
@說明:
@時間: 2025/03/18 17:07:21
@作者: LiDong
'''

import datetime
import os
from typing import Any, Dict, List, Optional

from bson.objectid import ObjectId
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure


class MongoDBHandler:
    """MongoDB数据库操作类"""

    def __init__(self, connection_string, db_name, logger):
        """
        初始化MongoDB连接

        Args:
            connection_string: MongoDB连接字符串，如果为None则尝试从环境变量获取
            db_name: 数据库名称
        """
        self.logger = logger
        # 如果未提供连接字符串，尝试从环境变量获取
        if connection_string is None:
            connection_string = os.getenv(
                "MONGO_CONNECTION_STRING",
                "mongodb://localhost:27017/"
            )
        try:
            # 建立连接
            self.client = MongoClient(connection_string)
            # 测试连接
            self.client.admin.command('ping')
            self.logger.info("成功连接到MongoDB")
            # 选择数据库
            self.db = self.client[db_name]
        except ConnectionFailure as e:
            self.logger.error(f"MongoDB连接失败: {e}")
            raise

    def close_connection(self):
        """关闭MongoDB连接"""
        if hasattr(self, 'client'):
            self.client.close()
            self.logger.info("MongoDB连接已关闭")

    # ===== 基本CRUD操作 =====

    def insert_one(self, collection_name: str, document: Dict[str, Any]):
        """
        插入单个文档

        Args:
            collection_name: 集合名称
            document: 要插入的文档

        Returns:
            str: 插入文档的ID
        """
        try:
            collection = self.db[collection_name]
            # 添加创建时间
            if 'created_at' not in document:
                document['created_at'] = datetime.datetime.now()

            result = collection.insert_one(document)
            self.logger.info(f"成功插入文档，ID: {result.inserted_id}")
            return str(result.inserted_id)
        except Exception as e:
            self.logger.error(f"插入文档失败: {e}")
            raise

    def insert_many(self, collection_name, documents: List[Dict[str, Any]]):
        """
        插入多个文档

        Args:
            collection_name: 集合名称
            documents: 要插入的文档列表

        Returns:
            List[str]: 插入文档的ID列表
        """
        try:
            collection = self.db[collection_name]
            # 为每个文档添加创建时间
            for doc in documents:
                if 'created_at' not in doc:
                    doc['created_at'] = datetime.datetime.now()

            result = collection.insert_many(documents)
            inserted_ids = [str(id) for id in result.inserted_ids]
            self.logger.info(f"成功插入{len(inserted_ids)}个文档")
            return inserted_ids
        except Exception as e:
            self.logger.error(f"批量插入文档失败: {e}")
            raise

    def find_one(self, collection_name: str, query: Dict[str, Any]):
        """
        查找单个文档

        Args:
            collection_name: 集合名称
            query: 查询条件

        Returns:
            Optional[Dict[str, Any]]: 找到的文档，如果没找到返回None
        """
        try:
            collection = self.db[collection_name]
            result = collection.find_one(query)
            return result
        except Exception as e:
            self.logger.error(f"查找文档失败: {e}")
            raise

    def find_by_id(self, collection_name: str, doc_id: str):
        """
        通过ID查找文档

        Args:
            collection_name: 集合名称
            doc_id: 文档ID

        Returns:
            Optional[Dict[str, Any]]: 找到的文档，如果没找到返回None
        """
        try:
            collection = self.db[collection_name]
            result = collection.find_one({"_id": ObjectId(doc_id)})
            return result
        except Exception as e:
            self.logger.error(f"通过ID查找文档失败: {e}")
            raise

    def find_many(
        self,
        collection_name: str,
        query: Dict[str, Any],
        sort_by: Optional[List] = None,
        limit: int = 0,
        skip: int = 0,
        filters: Dict[str, int] = {}
    ):
        """
        查找多个文档

        Args:
            collection_name: 集合名称
            query: 查询条件
            sort_by: 排序条件，例如[("name", pymongo.ASCENDING)]
            limit: 限制返回的文档数量，0表示不限制
            skip: 跳过的文档数量

        Returns:
            List[Dict[str, Any]]: 找到的文档列表
        """
        try:
            collection = self.db[collection_name]
            if filters:
                cursor = collection.find(query, filters)
            else:
                cursor = collection.find(query)
            if sort_by:
                cursor = cursor.sort(sort_by)

            if skip:
                cursor = cursor.skip(skip)

            if limit:
                cursor = cursor.limit(limit)

            return list(cursor)
        except Exception as e:
            self.logger.error(f"查找多个文档失败: {e}")
            raise

    def update_one(
        self,
        collection_name: str,
        query: Dict[str, Any],
        update_data: Dict[str, Any],
        upsert: bool = False
    ) -> int:
        """
        更新单个文档

        Args:
            collection_name: 集合名称
            query: 查询条件
            update_data: 更新数据
            upsert: 如果为True，当文档不存在时会创建新文档

        Returns:
            int: 更新的文档数量
        """
        try:
            collection = self.db[collection_name]

            # 确保update_data是正确的格式，包含$set等操作符
            if not any(k.startswith('$') for k in update_data.keys()):
                update_data = {"$set": update_data}

            # 添加更新时间
            if "$set" in update_data:
                update_data["$set"]["updated_at"] = datetime.datetime.now()
            else:
                update_data["$set"] = {"updated_at": datetime.datetime.now()}

            result = collection.update_one(query, update_data, upsert=upsert)
            self.logger.info(f"更新了{result.modified_count}个文档")
            return result.modified_count
        except Exception as e:
            self.logger.error(f"更新文档失败: {e}")
            raise

    def update_by_id(
        self,
        collection_name: str,
        doc_id: str,
        update_data: Dict[str, Any]
    ) -> int:
        """
        通过ID更新文档

        Args:
            collection_name: 集合名称
            doc_id: 文档ID
            update_data: 更新数据

        Returns:
            int: 更新的文档数量
        """
        query = {"_id": ObjectId(doc_id)}
        return self.update_one(collection_name, query, update_data)

    def update_many(
        self,
        collection_name: str,
        query: Dict[str, Any],
        update_data: Dict[str, Any]
    ) -> int:
        """
        更新多个文档

        Args:
            collection_name: 集合名称
            query: 查询条件
            update_data: 更新数据

        Returns:
            int: 更新的文档数量
        """
        try:
            collection = self.db[collection_name]

            # 确保update_data是正确的格式
            if not any(k.startswith('$') for k in update_data.keys()):
                update_data = {"$set": update_data}

            # 添加更新时间
            if "$set" in update_data:
                update_data["$set"]["updated_at"] = datetime.datetime.now()
            else:
                update_data["$set"] = {"updated_at": datetime.datetime.now()}

            result = collection.update_many(query, update_data)
            self.logger.info(f"更新了{result.modified_count}个文档")
            return result.modified_count
        except Exception as e:
            self.logger.error(f"批量更新文档失败: {e}")
            raise

    def delete_one(self, collection_name: str, query: Dict[str, Any]) -> int:
        """
        删除单个文档

        Args:
            collection_name: 集合名称
            query: 查询条件

        Returns:
            int: 删除的文档数量
        """
        try:
            collection = self.db[collection_name]
            result = collection.delete_one(query)
            self.logger.info(f"删除了{result.deleted_count}个文档")
            return result.deleted_count
        except Exception as e:
            self.logger.error(f"删除文档失败: {e}")
            raise

    def delete_by_id(self, collection_name: str, doc_id: str) -> int:
        """
        通过ID删除文档

        Args:
            collection_name: 集合名称
            doc_id: 文档ID

        Returns:
            int: 删除的文档数量
        """
        query = {"_id": ObjectId(doc_id)}
        return self.delete_one(collection_name, query)

    def delete_many(self, collection_name: str, query: Dict[str, Any]) -> int:
        """
        删除多个文档

        Args:
            collection_name: 集合名称
            query: 查询条件

        Returns:
            int: 删除的文档数量
        """
        try:
            collection = self.db[collection_name]
            result = collection.delete_many(query)
            self.logger.info(f"删除了{result.deleted_count}个文档")
            return result.deleted_count
        except Exception as e:
            self.logger.error(f"批量删除文档失败: {e}")
            raise

    # ===== 高级操作 =====

    def count_documents(self, collection_name: str, query: Dict[str, Any]):
        """
        计算符合条件的文档数量

        Args:
            collection_name: 集合名称
            query: 查询条件

        Returns:
            int: 文档数量
        """
        try:
            collection = self.db[collection_name]
            count = collection.count_documents(query)
            return count
        except Exception as e:
            self.logger.error(f"计算文档数量失败: {e}")
            raise

    def distinct(
        self,
        collection_name: str,
        field: str,
        query: Optional[Dict[str, Any]] = None
    ) -> List[Any]:
        """
        获取字段的唯一值

        Args:
            collection_name: 集合名称
            field: 字段名
            query: 可选的查询条件

        Returns:
            List[Any]: 唯一值列表
        """
        try:
            collection = self.db[collection_name]
            if query is None:
                query = {}
            result = collection.distinct(field, query)
            return result
        except Exception as e:
            self.logger.error(f"获取唯一值失败: {e}")
            raise

    def create_index(
        self,
        collection_name: str,
        keys: List[tuple],
        unique: bool = False
    ) -> str:
        """
        创建索引

        Args:
            collection_name: 集合名称
            keys: 索引键列表，例如[("name", pymongo.ASCENDING)]
            unique: 是否唯一索引

        Returns:
            str: 索引名称
        """
        try:
            collection = self.db[collection_name]
            index_name = collection.create_index(keys, unique=unique)
            self.logger.info(f"创建索引: {index_name}")
            return index_name
        except Exception as e:
            self.logger.error(f"创建索引失败: {e}")
            raise

    def list_indexes(self, collection_name: str) -> List[Dict[str, Any]]:
        """
        列出集合的所有索引

        Args:
            collection_name: 集合名称

        Returns:
            List[Dict[str, Any]]: 索引列表
        """
        try:
            collection = self.db[collection_name]
            indexes = list(collection.list_indexes())
            return indexes
        except Exception as e:
            self.logger.error(f"列出索引失败: {e}")
            raise

    def aggregate(
        self,
        collection_name: str,
        pipeline: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        执行聚合查询

        Args:
            collection_name: 集合名称
            pipeline: 聚合管道

        Returns:
            List[Dict[str, Any]]: 聚合结果
        """
        try:
            collection = self.db[collection_name]
            result = list(collection.aggregate(pipeline))
            return result
        except Exception as e:
            self.logger.error(f"执行聚合查询失败: {e}")
            raise

    def bulk_write(
        self,
        collection_name: str,
        operations: List,
        ordered: bool = True
    ) -> Dict[str, int]:
        """
        批量写入操作

        Args:
            collection_name: 集合名称
            operations: 操作列表
            ordered: 是否按顺序执行

        Returns:
            Dict[str, int]: 操作结果统计
        """
        try:
            collection = self.db[collection_name]
            result = collection.bulk_write(operations, ordered=ordered)
            stats = {
                "inserted": result.inserted_count,
                "modified": result.modified_count,
                "deleted": result.deleted_count,
                "upserted": result.upserted_count,
            }
            self.logger.info(f"批量写入操作完成: {stats}")
            return stats
        except Exception as e:
            self.logger.error(f"批量写入操作失败: {e}")
            raise

    def create_collection(
        self,
        collection_name: str,
        validator: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        创建集合，可设置验证规则

        Args:
            collection_name: 集合名称
            validator: 验证规则

        Returns:
            bool: 是否成功
        """
        try:
            if validator:
                self.db.create_collection(
                    collection_name,
                    validator=validator,
                    validationLevel="moderate",
                    validationAction="error"
                )
            else:
                self.db.create_collection(collection_name)
            self.logger.info(f"创建集合: {collection_name}")
            return True
        except Exception as e:
            self.logger.error(f"创建集合失败: {e}")
            raise

    def drop_collection(self, collection_name: str):
        """
        刪除集合，可设置验证规则

        Args:
            collection_name: 集合名称

        Returns:
            bool: 是否成功
        """
        return self.db.drop_collection(collection_name)

    def get_collection_names(self) -> List[str]:
        """
        获取所有集合名称

        Returns:
            List[str]: 集合名称列表
        """
        try:
            collections = self.db.list_collection_names()
            return collections
        except Exception as e:
            self.logger.error(f"获取集合名称失败: {e}")
            raise
