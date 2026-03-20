# -*- coding: utf-8 -*-
"""
@文件: test_controller.py
@說明: 测试业务逻辑控制器
@時間: 2023/12/01 12:03:55

多表事务操作说明：
    Controller 层负责业务校验和缓存管理，
    多表事务操作委托给 Model 层的 OperTestModel（如 add_with_log）确保原子性
"""

from cache.redis_oper import OperRedis
from utils.exceptions import (
    ResourceExistsException,
    ResourceNotFoundException,
    ValidationException,
)
from configs.base import BaseConfig
from models.test_model import OperTestModel
from serializes.model_serialize import TestModelSchema


class TestController:
    def __init__(self):
        self.oper_test = OperTestModel()
        self.oper_redis = OperRedis()
        self.schema = TestModelSchema()
        self.cache_timeout = BaseConfig.CACHE_DEFAULT_TIMEOUT

    def search(self, work_no: str = None):
        """
        查询记录
        - 如果指定 work_no，查询单条记录
        - 否则查询所有记录
        """
        # 先查缓存
        cache_key = f"test:{work_no}" if work_no else "test:all"
        cached_data = self.oper_redis.get(cache_key)
        if cached_data:
            return cached_data

        # 查数据库
        if work_no:
            data = self.oper_test.search_by_work_no(work_no)
            if not data:
                raise ResourceNotFoundException(
                    resource_type="记录",
                    msg=f"工号 {work_no} 不存在",
                    content={"work_no": work_no}
                )
            result = self.schema.dump(data)
        else:
            data = self.oper_test.search_all()
            result = self.schema.dump(data, many=True)

        # 写入缓存
        self.oper_redis.set(cache_key, result, ex=self.cache_timeout)
        return result

    def add(self, data: dict, operator_work_no: str = None):
        """
        添加记录（多表事务示例）

        同时操作：
        1. test_form 表 - 插入用户记录
        2. operation_log 表 - 插入操作日志

        Args:
            data: 用户数据
            operator_work_no: 操作人工号（用于记录日志）
        """
        work_no = data.get("work_no")
        if not work_no:
            raise ValidationException(
                msg="工号不能为空",
                content={"field": "work_no"}
            )

        # 检查是否已存在
        if self.oper_test.exists(work_no):
            raise ResourceExistsException(
                resource_type="工号",
                msg=f"工号 {work_no} 已存在",
                content={"work_no": work_no}
            )

        # 调用 Model 层多表事务方法
        self.oper_test.add_with_log(data, operator_work_no)

        # 清除缓存
        self.oper_redis.delete("test:all")
        return True

    def update(self, work_no: str, update_data: dict, operator_work_no: str = None):
        """
        更新记录（多表事务示例）

        同时操作：
        1. test_form 表 - 更新用户记录
        2. operation_log 表 - 插入操作日志

        Args:
            work_no: 要更新的工号
            update_data: 更新数据
            operator_work_no: 操作人工号
        """
        if not work_no:
            raise ValidationException(
                msg="工号不能为空",
                content={"field": "work_no"}
            )

        # 检查记录是否存在
        if not self.oper_test.exists(work_no):
            raise ResourceNotFoundException(
                resource_type="记录",
                msg=f"工号 {work_no} 不存在",
                content={"work_no": work_no}
            )

        # 调用 Model 层多表事务方法
        self.oper_test.update_with_log(work_no, update_data, operator_work_no)

        # 清除缓存
        self.oper_redis.delete(f"test:{work_no}")
        self.oper_redis.delete("test:all")
        return True

    def list(self, page: int = 1, page_size: int = 20, work_no: str = None) -> dict:
        """
        分页查询

        Args:
            page: 页码（从 1 开始）
            page_size: 每页条数
            work_no: 按工号筛选（可选）

        Returns:
            包含 list, page, page_size, total 的字典
        """
        try:
            page = max(1, int(page))
        except Exception:
            page = 1

        try:
            page_size = max(1, int(page_size))
        except Exception:
            page_size = BaseConfig.PAGE_SIZE_DEFAULT

        # 使用 Model 层的分页方法
        result = self.oper_test.search_with_pagination(
            page=page,
            page_size=page_size,
            work_no=work_no
        )

        # 序列化结果
        items = self.schema.dump(result["items"], many=True)

        return {
            "list": items,
            "page": result["page"],
            "page_size": result["page_size"],
            "total": result["total"]
        }

    def delete(self, work_no: str, operator_work_no: str = None):
        """
        删除记录（多表事务示例）

        同时操作：
        1. test_form 表 - 删除用户记录
        2. operation_log 表 - 插入操作日志

        Args:
            work_no: 要删除的工号
            operator_work_no: 操作人工号
        """
        if not work_no:
            raise ValidationException(
                msg="工号不能为空",
                content={"field": "work_no"}
            )

        # 检查记录是否存在
        if not self.oper_test.exists(work_no):
            raise ResourceNotFoundException(
                resource_type="记录",
                msg=f"工号 {work_no} 不存在",
                content={"work_no": work_no}
            )

        # 调用 Model 层多表事务方法
        self.oper_test.delete_with_log(work_no, operator_work_no)

        # 清除缓存
        self.oper_redis.delete(f"test:{work_no}")
        self.oper_redis.delete("test:all")
        return True
