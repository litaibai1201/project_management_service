# -*- coding: utf-8 -*-
"""
@文件: enhanced_operations.py
@说明: MongoDB 增强操作封装 - 企业级特性
@时间: 2025-09-03

新增功能：
1. 多文档事务支持
2. 软删除
3. 审计字段自动填充
4. 批量写操作
5. Pydantic 验证集成
"""
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from contextlib import contextmanager

from pymongo import UpdateOne, DeleteOne, InsertOne, ReplaceOne
from pymongo.client_session import ClientSession
from pydantic import BaseModel, ValidationError

from .client import mongo_client
from .operations import MongoOperations
from loggers import logger


class EnhancedMongoOperations(MongoOperations):
    """MongoDB 增强操作封装类

    在基础操作类基础上增加：
    - 多文档事务支持
    - 软删除功能
    - 审计字段自动填充
    - 批量写操作
    - Pydantic 数据验证
    """

    def __init__(
        self,
        collection_name: str,
        database: str = None,
        enable_soft_delete: bool = False,
        enable_audit: bool = False,
        schema: Optional[BaseModel] = None,
    ):
        """初始化增强操作类

        Args:
            collection_name: 集合名称
            database: 数据库名称
            enable_soft_delete: 启用软删除
            enable_audit: 启用审计字段
            schema: Pydantic 验证模型
        """
        super().__init__(collection_name, database)
        self.enable_soft_delete = enable_soft_delete
        self.enable_audit = enable_audit
        self.schema = schema

    # ==================== 事务支持 ====================

    @contextmanager
    def transaction(self):
        """事务上下文管理器

        使用方法:
            with ops.transaction() as session:
                ops.insert_one(doc1, session=session)
                ops.update_one(filter, update, session=session)
                # 任何异常都会自动回滚

        注意: 需要 MongoDB 4.0+ 和副本集或分片集群
        """
        session = mongo_client.client.start_session()
        try:
            with session.start_transaction():
                yield session
                # 自动提交
        except Exception as e:
            logger.error("MongoDB 事务回滚", category="error", event="mongo_transaction_rollback", error=e)
            raise
        finally:
            session.end_session()

    # ==================== 审计字段自动填充 ====================

    def _add_audit_fields(
        self,
        document: Dict[str, Any],
        operation: str = "create",
        operator: str = "system",
    ) -> Dict[str, Any]:
        """添加审计字段

        Args:
            document: 文档数据
            operation: 操作类型 (create/update)
            operator: 操作人

        Returns:
            添加审计字段后的文档
        """
        if not self.enable_audit:
            return document

        now = datetime.now()

        if operation == "create":
            document.setdefault("created_at", now)
            document.setdefault("created_by", operator)

        document["updated_at"] = now
        document["updated_by"] = operator

        return document

    # ==================== 软删除 ====================

    def soft_delete_one(
        self,
        filter: Dict[str, Any],
        operator: str = "system",
        session: ClientSession = None,
    ) -> int:
        """软删除单个文档

        Args:
            filter: 查询条件
            operator: 操作人
            session: 事务会话

        Returns:
            删除的文档数量
        """
        if not self.enable_soft_delete:
            logger.warning("软删除未启用，执行硬删除")
            return self.delete_one(filter)

        update = {
            "$set": {
                "deleted_at": datetime.now(),
                "deleted_by": operator,
            }
        }

        result = self.collection.update_one(filter, update, session=session)
        return result.modified_count

    def soft_delete_many(
        self,
        filter: Dict[str, Any],
        operator: str = "system",
        session: ClientSession = None,
    ) -> int:
        """软删除多个文档

        Args:
            filter: 查询条件
            operator: 操作人
            session: 事务会话

        Returns:
            删除的文档数量
        """
        if not self.enable_soft_delete:
            logger.warning("软删除未启用，执行硬删除")
            return self.delete_many(filter)

        update = {
            "$set": {
                "deleted_at": datetime.now(),
                "deleted_by": operator,
            }
        }

        result = self.collection.update_many(filter, update, session=session)
        return result.modified_count

    def restore_one(self, filter: Dict[str, Any]) -> int:
        """恢复已软删除的文档

        Args:
            filter: 查询条件

        Returns:
            恢复的文档数量
        """
        update = {
            "$unset": {
                "deleted_at": "",
                "deleted_by": "",
            }
        }

        result = self.collection.update_one(filter, update)
        return result.modified_count

    def _add_soft_delete_filter(self, filter: Dict[str, Any]) -> Dict[str, Any]:
        """为查询条件添加软删除过滤

        Args:
            filter: 原始查询条件

        Returns:
            添加软删除过滤后的条件
        """
        if not self.enable_soft_delete:
            return filter

        if filter is None:
            filter = {}

        # 只查询未删除的文档
        filter["deleted_at"] = {"$exists": False}
        return filter

    # ==================== 重写查询方法（支持软删除过滤） ====================

    def find(
        self,
        filter: Dict[str, Any] = None,
        projection: Dict[str, Any] = None,
        sort: List[tuple] = None,
        skip: int = 0,
        limit: int = 0,
        include_deleted: bool = False,
    ) -> List[Dict[str, Any]]:
        """查询多个文档（支持软删除过滤）

        Args:
            filter: 查询条件
            projection: 字段投影
            sort: 排序规则
            skip: 跳过条数
            limit: 限制条数
            include_deleted: 是否包含已删除的文档

        Returns:
            文档列表
        """
        if not include_deleted:
            filter = self._add_soft_delete_filter(filter)

        return super().find(filter, projection, sort, skip, limit)

    def find_one(
        self,
        filter: Dict[str, Any] = None,
        projection: Dict[str, Any] = None,
        include_deleted: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """查询单个文档（支持软删除过滤）

        Args:
            filter: 查询条件
            projection: 字段投影
            include_deleted: 是否包含已删除的文档

        Returns:
            文档或 None
        """
        if not include_deleted:
            filter = self._add_soft_delete_filter(filter)

        return super().find_one(filter, projection)

    def count(
        self,
        filter: Dict[str, Any] = None,
        include_deleted: bool = False,
    ) -> int:
        """统计文档数量（支持软删除过滤）

        Args:
            filter: 查询条件
            include_deleted: 是否包含已删除的文档

        Returns:
            文档数量
        """
        if not include_deleted:
            filter = self._add_soft_delete_filter(filter)

        return super().count(filter)

    # ==================== 重写插入方法（支持审计和验证） ====================

    def insert_one(
        self,
        document: Dict[str, Any],
        operator: str = "system",
        session: ClientSession = None,
        validate: bool = True,
    ) -> str:
        """插入单个文档（支持审计和验证）

        Args:
            document: 文档数据
            operator: 操作人
            session: 事务会话
            validate: 是否进行 Pydantic 验证

        Returns:
            插入文档的 _id
        """
        # Pydantic 验证
        if validate and self.schema:
            try:
                validated = self.schema(**document)
                document = validated.model_dump()
            except ValidationError as e:
                logger.error("数据验证失败", category="error", event="mongo_data_validation_failed", error=e)
                raise

        # 添加审计字段
        document = self._add_audit_fields(document, "create", operator)

        # 插入
        result = self.collection.insert_one(document, session=session)
        return str(result.inserted_id)

    def insert_many(
        self,
        documents: List[Dict[str, Any]],
        operator: str = "system",
        session: ClientSession = None,
        validate: bool = True,
    ) -> List[str]:
        """批量插入文档（支持审计和验证）

        Args:
            documents: 文档列表
            operator: 操作人
            session: 事务会话
            validate: 是否进行 Pydantic 验证

        Returns:
            插入文档的 _id 列表
        """
        # Pydantic 验证
        if validate and self.schema:
            validated_docs = []
            for doc in documents:
                try:
                    validated = self.schema(**doc)
                    validated_docs.append(validated.model_dump())
                except ValidationError as e:
                    logger.error("数据验证失败", category="error", event="mongo_data_validation_failed", error=e)
                    raise
            documents = validated_docs

        # 添加审计字段
        documents = [
            self._add_audit_fields(doc, "create", operator)
            for doc in documents
        ]

        # 插入
        result = self.collection.insert_many(documents, session=session)
        return [str(id_) for id_ in result.inserted_ids]

    # ==================== 重写更新方法（支持审计） ====================

    def update_one(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        operator: str = "system",
        upsert: bool = False,
        session: ClientSession = None,
    ) -> int:
        """更新单个文档（支持审计）

        Args:
            filter: 查询条件
            update: 更新操作
            operator: 操作人
            upsert: 不存在时是否插入
            session: 事务会话

        Returns:
            修改的文档数量
        """
        # 自动添加 updated_at 和 updated_by
        if self.enable_audit:
            if "$set" not in update:
                update["$set"] = {}
            update["$set"]["updated_at"] = datetime.now()
            update["$set"]["updated_by"] = operator

        result = self.collection.update_one(filter, update, upsert=upsert, session=session)
        return result.modified_count

    def update_many(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        operator: str = "system",
        upsert: bool = False,
        session: ClientSession = None,
    ) -> int:
        """批量更新文档（支持审计）

        Args:
            filter: 查询条件
            update: 更新操作
            operator: 操作人
            upsert: 不存在时是否插入
            session: 事务会话

        Returns:
            修改的文档数量
        """
        # 自动添加 updated_at 和 updated_by
        if self.enable_audit:
            if "$set" not in update:
                update["$set"] = {}
            update["$set"]["updated_at"] = datetime.now()
            update["$set"]["updated_by"] = operator

        result = self.collection.update_many(filter, update, upsert=upsert, session=session)
        return result.modified_count

    # ==================== 批量写操作 ====================

    def bulk_write(
        self,
        operations: List[Union[InsertOne, UpdateOne, DeleteOne, ReplaceOne]],
        ordered: bool = True,
        session: ClientSession = None,
    ) -> Dict[str, int]:
        """批量写操作

        Args:
            operations: 操作列表
            ordered: 是否按顺序执行
            session: 事务会话

        Returns:
            操作结果统计

        示例:
            from pymongo import InsertOne, UpdateOne, DeleteOne

            ops = [
                InsertOne({"name": "Alice", "age": 25}),
                UpdateOne({"name": "Bob"}, {"$set": {"age": 26}}),
                DeleteOne({"name": "Charlie"}),
            ]
            result = ops.bulk_write(ops)
        """
        try:
            result = self.collection.bulk_write(operations, ordered=ordered, session=session)
            return {
                "inserted_count": result.inserted_count,
                "modified_count": result.modified_count,
                "deleted_count": result.deleted_count,
                "upserted_count": result.upserted_count,
            }
        except Exception as e:
            logger.error("批量写操作失败", category="error", event="mongo_bulk_write_failed", error=e)
            raise

    # ==================== 便捷批量操作方法 ====================

    def bulk_insert(
        self,
        documents: List[Dict[str, Any]],
        operator: str = "system",
        session: ClientSession = None,
    ) -> Dict[str, int]:
        """批量插入（使用 bulk_write 优化）

        Args:
            documents: 文档列表
            operator: 操作人
            session: 事务会话

        Returns:
            操作结果
        """
        # 添加审计字段
        documents = [
            self._add_audit_fields(doc, "create", operator)
            for doc in documents
        ]

        operations = [InsertOne(doc) for doc in documents]
        return self.bulk_write(operations, session=session)

    def bulk_update(
        self,
        updates: List[tuple],
        operator: str = "system",
        session: ClientSession = None,
    ) -> Dict[str, int]:
        """批量更新（使用 bulk_write 优化）

        Args:
            updates: 更新列表，每个元素为 (filter, update) 元组
            operator: 操作人
            session: 事务会话

        Returns:
            操作结果

        示例:
            updates = [
                ({"_id": "1"}, {"$set": {"status": 1}}),
                ({"_id": "2"}, {"$set": {"status": 0}}),
            ]
            ops.bulk_update(updates)
        """
        operations = []
        for filter_doc, update_doc in updates:
            # 添加审计字段
            if self.enable_audit:
                if "$set" not in update_doc:
                    update_doc["$set"] = {}
                update_doc["$set"]["updated_at"] = datetime.now()
                update_doc["$set"]["updated_by"] = operator

            operations.append(UpdateOne(filter_doc, update_doc))

        return self.bulk_write(operations, session=session)

    def bulk_delete(
        self,
        filters: List[Dict[str, Any]],
        soft: bool = None,
        operator: str = "system",
        session: ClientSession = None,
    ) -> Dict[str, int]:
        """批量删除（使用 bulk_write 优化）

        Args:
            filters: 查询条件列表
            soft: 是否软删除（None 表示使用配置）
            operator: 操作人
            session: 事务会话

        Returns:
            操作结果

        示例:
            filters = [
                {"_id": "1"},
                {"_id": "2"},
            ]
            ops.bulk_delete(filters)
        """
        if soft is None:
            soft = self.enable_soft_delete

        operations = []

        if soft:
            # 软删除
            for filter_doc in filters:
                update = {
                    "$set": {
                        "deleted_at": datetime.now(),
                        "deleted_by": operator,
                    }
                }
                operations.append(UpdateOne(filter_doc, update))
        else:
            # 硬删除
            for filter_doc in filters:
                operations.append(DeleteOne(filter_doc))

        return self.bulk_write(operations, session=session)


__all__ = ["EnhancedMongoOperations"]
