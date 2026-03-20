# -*- coding: utf-8 -*-
"""
@文件: test_model.py
@說明: 测试模型数据操作层
@時間: 2024/08/28 11:45:04

数据库操作说明：
    - 使用 Flask-SQLAlchemy 的 db 对象进行数据库操作
    - 使用 DBFunction 辅助类进行 CRUD 操作，自动处理事务和异常
    - 多表事务操作（如 add_with_log）在本层完成，保证原子性
    - 支持通过配置开启分库分表功能（见 .env.example）
"""

import json
from functools import cached_property
from typing import Dict, List, Optional

from utils.exceptions import DatabaseException
from dbs.mysql_db import db, DBFunction
from dbs.mysql_db.model_tables import TestModel, OperationLogModel


class OperTestModel:
    """
    测试模型操作类

    使用 Flask-SQLAlchemy 的 db 对象和 DBFunction 辅助类
    """

    def __init__(self):
        self.db_func = DBFunction()

    @cached_property
    def session_data(self):
        """获取查询会话"""
        return db.session.query(TestModel)

    def add(self, data: Dict) -> bool:
        """
        添加记录

        Args:
            data: 记录数据字典

        Returns:
            添加成功返回 True
        """
        model = TestModel(**data)
        return DBFunction.db_add(model)

    def put(self, work_no: str, update_data: Dict) -> int:
        """
        根据工号更新记录

        Args:
            work_no: 工号
            update_data: 更新数据

        Returns:
            更新的记录数
        """
        try:
            result = db.session.query(TestModel).filter(
                TestModel.work_no == work_no
            ).update(update_data)
            db.session.commit()
            return result
        except Exception as e:
            db.session.rollback()
            raise DatabaseException(
                msg="数据修改失败",
                content={"work_no": work_no, "error": str(e)}
            )

    def delete(self, work_no: str) -> int:
        """
        根据工号删除记录

        Args:
            work_no: 工号

        Returns:
            删除的记录数
        """
        try:
            result = db.session.query(TestModel).filter(
                TestModel.work_no == work_no
            ).delete()
            db.session.commit()
            return result
        except Exception as e:
            db.session.rollback()
            raise DatabaseException(
                msg="数据删除失败",
                content={"work_no": work_no, "error": str(e)}
            )

    def bulk_add(self, data_list: List[Dict]) -> bool:
        """
        批量添加记录

        Args:
            data_list: 记录数据列表

        Returns:
            添加成功返回 True
        """
        models = [TestModel(**data) for data in data_list]
        return DBFunction.db_bulk_insert(models)

    def search_all(self) -> List[TestModel]:
        """查询所有记录"""
        return self.session_data.all()

    def search_by_work_no(self, work_no: str) -> Optional[TestModel]:
        """根据工号查询记录"""
        return self.session_data.filter(TestModel.work_no == work_no).first()

    def exists(self, work_no: str) -> bool:
        """检查工号是否存在"""
        return self.session_data.filter(TestModel.work_no == work_no).count() > 0

    def search_with_pagination(
        self,
        page: int = 1,
        page_size: int = 20,
        work_no: str = None
    ) -> Dict:
        """
        分页查询

        Args:
            page: 页码
            page_size: 每页条数
            work_no: 工号筛选

        Returns:
            包含 items, total, page, page_size 的字典
        """
        query = self.session_data
        if work_no:
            query = query.filter(TestModel.work_no == work_no)

        total = query.count()
        items = query.limit(page_size).offset((page - 1) * page_size).all()

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    # =========================================================================
    # 多表事务操作（TestModel + OperationLogModel 原子性保证）
    # =========================================================================

    def add_with_log(self, data: Dict, operator_work_no: str = None) -> bool:
        """
        添加用户记录并写入操作日志（多表事务）

        Args:
            data: 用户数据字典
            operator_work_no: 操作人工号（用于日志记录）

        Returns:
            成功返回 True

        Raises:
            DatabaseException: 事务失败时抛出
        """
        work_no = data.get("work_no", "")
        try:
            with DBFunction.transaction() as session:
                # 1. 插入用户表
                user = TestModel(**data)
                session.add(user)

                # 2. 插入操作日志表
                log = OperationLogModel(
                    work_no=operator_work_no or work_no,
                    operation="CREATE",
                    target_table="test_form",
                    target_id=user.id,
                    detail=json.dumps(data, ensure_ascii=False),
                )
                session.add(log)
                # 事务自动提交
        except Exception as e:
            raise DatabaseException(
                msg="添加记录失败",
                content={"work_no": work_no, "error": str(e)}
            )
        return True

    def update_with_log(self, work_no: str, update_data: Dict, operator_work_no: str = None) -> bool:
        """
        更新用户记录并写入操作日志（多表事务）

        Args:
            work_no: 要更新的工号
            update_data: 更新数据
            operator_work_no: 操作人工号

        Returns:
            成功返回 True

        Raises:
            DatabaseException: 事务失败时抛出
        """
        existing = self.search_by_work_no(work_no)
        try:
            with DBFunction.transaction() as session:
                # 1. 更新用户表
                session.query(TestModel).filter(
                    TestModel.work_no == work_no
                ).update(update_data)

                # 2. 插入操作日志表
                log = OperationLogModel(
                    work_no=operator_work_no or work_no,
                    operation="UPDATE",
                    target_table="test_form",
                    target_id=existing.id,
                    detail=json.dumps(update_data, ensure_ascii=False),
                )
                session.add(log)
                # 事务自动提交
        except Exception as e:
            raise DatabaseException(
                msg="更新记录失败",
                content={"work_no": work_no, "error": str(e)}
            )
        return True

    def delete_with_log(self, work_no: str, operator_work_no: str = None) -> bool:
        """
        删除用户记录并写入操作日志（多表事务）

        Args:
            work_no: 要删除的工号
            operator_work_no: 操作人工号

        Returns:
            成功返回 True

        Raises:
            DatabaseException: 事务失败时抛出
        """
        existing = self.search_by_work_no(work_no)
        target_id = existing.id
        try:
            with DBFunction.transaction() as session:
                # 1. 删除用户表记录
                session.query(TestModel).filter(
                    TestModel.work_no == work_no
                ).delete()

                # 2. 插入操作日志表
                log = OperationLogModel(
                    work_no=operator_work_no or work_no,
                    operation="DELETE",
                    target_table="test_form",
                    target_id=target_id,
                    detail=json.dumps({"work_no": work_no},
                                      ensure_ascii=False),
                )
                session.add(log)
                # 事务自动提交
        except Exception as e:
            raise DatabaseException(
                msg="删除记录失败",
                content={"work_no": work_no, "error": str(e)}
            )
        return True
