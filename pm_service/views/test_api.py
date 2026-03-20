# -*- coding: utf-8 -*-
"""
@文件: test_api.py
@说明: 测试 API 接口 - 包含框架各功能模块的使用样例
@时间: 2023/12/01 11:21:23

MVC 模式说明：
    View 层（本文件）：负责接收请求、参数校验、调用 Controller、返回响应
    Controller 层：负责业务逻辑处理
    Model 层：负责数据库操作

框架功能样例：
    1. CRUD 操作 - 基础的增删改查
    2. JWT 认证 - 接口保护
    3. 参数校验 - Marshmallow Schema
    4. 异常处理 - 统一异常捕获
    5. 缓存操作 - Redis 缓存
    6. 分页查询 - 配置化分页
    7. 文件上传 - MinIO/S3 存储
    8. 配置使用 - BaseConfig
"""

from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint

from utils.response import response_result
from utils.exceptions import ValidationException
from configs.base import BaseConfig
from controllers.test_controller import TestController
from controllers.cache_controller import CacheController
from controllers.file_controller import FileController
from controllers.config_controller import ConfigController
from utils.auth import jwt_required, get_identity
from serializes.response_serialize import RspMsgDictSchema, RspMsgSchema
from serializes.test_serialize import TestSchema, TestQuerySchema

blp = Blueprint("test_api", __name__, description="测试接口 - 框架功能样例")


# =============================================================================
# 基础 CRUD 接口
# =============================================================================

@blp.route("")
class TestApi(MethodView):
    """
    测试数据 CRUD 接口

    演示功能：
    - JWT 认证保护
    - Marshmallow 参数校验
    - Controller 层调用
    - 统一响应格式
    - 异常自动捕获
    """

    def __init__(self):
        self.controller = TestController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        查询记录

        Query 参数:
            work_no: 工号（可选，不传则查询全部）
        """
        work_no = request.args.get("work_no")
        data = self.controller.search(work_no)
        return response_result(content=data)

    @blp.arguments(TestSchema)
    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def post(self, payload):
        """创建记录（需要登录）"""
        self.controller.add(payload)
        return response_result(content=payload, msg="创建成功")

    @blp.arguments(TestSchema)
    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def put(self, payload):
        """更新记录（需要登录）"""
        work_no = payload.get("work_no")
        update_data = {k: v for k, v in payload.items() if k !=
                       "work_no" and v is not None}
        self.controller.update(work_no, update_data)
        return response_result(msg="更新成功")

    @blp.arguments(TestSchema)
    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self, payload):
        """删除记录（需要登录）"""
        self.controller.delete(payload.get("work_no"))
        return response_result(msg="删除成功")


# =============================================================================
# 分页查询样例
# =============================================================================

@blp.route("/list")
class TestListApi(MethodView):
    """
    分页查询接口

    演示功能：
    - 分页参数处理
    - 配置化分页大小
    """

    def __init__(self):
        self.controller = TestController()
        # 从配置获取分页参数
        self.page_size_default = BaseConfig.PAGE_SIZE_DEFAULT
        self.page_size_max = BaseConfig.PAGE_SIZE_MAX

    @blp.arguments(TestQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """
        分页查询

        Query 参数:
            page: 页码，默认 1
            page_size: 每页条数，默认 20，最大 100
            work_no: 工号筛选（可选）
        """
        page = query_params.get("page", 1)
        page_size = min(query_params.get(
            "page_size", self.page_size_default), self.page_size_max)
        work_no = query_params.get("work_no")

        # 将分页逻辑委托给 Controller
        result = self.controller.list(
            page=page, page_size=page_size, work_no=work_no)
        return response_result(content=result)


# =============================================================================
# 缓存操作样例
# =============================================================================

@blp.route("/cache")
class CacheApi(MethodView):
    """
    缓存操作接口

    演示功能：
    - Redis 字符串操作
    - Redis Hash 操作
    - Redis List 操作
    - 缓存过期时间配置
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        获取缓存数据

        Query 参数:
            key: 缓存键名
            type: 缓存类型（string/hash/list），默认 string
        """
        key = request.args.get("key")
        cache_type = request.args.get("type", "string")

        if not key:
            raise ValidationException(msg="缓存键名不能为空", content={"field": "key"})

        data = self.cache_controller.get_cache(key, cache_type)
        return response_result(content={"key": key, "type": cache_type, "value": data})

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def post(self):
        """
        设置缓存数据

        Body 参数:
            key: 缓存键名
            value: 缓存值
            type: 缓存类型（string/hash/list），默认 string
            ttl: 过期时间（秒），可选
        """
        data = request.get_json() or {}
        key = data.get("key")
        value = data.get("value")
        cache_type = data.get("type", "string")
        ttl = data.get("ttl")

        if not key:
            raise ValidationException(msg="缓存键名不能为空", content={"field": "key"})

        self.cache_controller.set_cache(key, value, cache_type, ttl)
        return response_result(msg="缓存设置成功")

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self):
        """删除缓存"""
        key = request.args.get("key")
        if not key:
            raise ValidationException(msg="缓存键名不能为空", content={"field": "key"})

        self.cache_controller.delete_cache(key)
        return response_result(msg="缓存删除成功")


# =============================================================================
# 文件上传样例
# =============================================================================

@blp.route("/file")
class FileApi(MethodView):
    """
    文件操作接口

    演示功能：
    - MinIO 文件上传
    - 文件下载 URL 生成
    - 存储桶管理
    """

    def __init__(self):
        self.file_controller = FileController()

    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def get(self):
        """
        获取文件信息/下载链接

        Query 参数:
            bucket_name: 存储桶名称
            file_path: 文件路径
        """
        bucket_name = request.args.get("bucket_name")
        file_path = request.args.get("file_path")

        if not bucket_name or not file_path:
            raise ValidationException(
                msg="参数不完整",
                content={"required": ["bucket_name", "file_path"]}
            )

        # 获取文件下载链接
        result = self.file_controller.get_file_url(bucket_name, file_path)
        return response_result(content=result)

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def post(self):
        """
        上传文件

        Form 参数:
            bucket_name: 存储桶名称
            file_path: 存储路径
            file: 文件
        """
        bucket_name = request.form.get("bucket_name")
        file_path = request.form.get("file_path")
        file = request.files.get("file")

        if not all([bucket_name, file_path, file]):
            raise ValidationException(
                msg="参数不完整",
                content={"required": ["bucket_name", "file_path", "file"]}
            )

        # 上传文件（FileController 会验证文件类型）
        stream_data = file.read()
        self.file_controller.upload_file(
            bucket_name, file_path, stream_data, file.filename)

        return response_result(msg="文件上传成功")


# =============================================================================
# 用户信息样例
# =============================================================================

@blp.route("/profile")
class ProfileApi(MethodView):
    """
    用户信息接口

    演示功能：
    - 获取当前登录用户信息
    - JWT identity 解析
    """

    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def get(self):
        """获取当前登录用户信息（从 JWT 解析）"""
        work_no = get_identity()
        return response_result(content={"work_no": work_no})


# =============================================================================
# 配置信息样例
# =============================================================================

@blp.route("/config")
class ConfigApi(MethodView):
    """
    配置信息接口

    演示功能：
    - 展示部分配置信息（非敏感）
    """

    def __init__(self):
        self.config_controller = ConfigController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取系统配置信息（通过 Controller）"""
        config = self.config_controller.get_public_config()
        return response_result(content=config)


# =============================================================================
# Redis 高级操作样例
# =============================================================================

@blp.route("/redis/counter")
class RedisCounterApi(MethodView):
    """
    Redis 计数器接口

    演示功能：
    - INCR/DECR 原子操作
    - 适用于：访问计数、限流计数、库存扣减等
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        获取计数器值

        Query 参数:
            key: 计数器键名
        """
        key = request.args.get("key", "counter:default")
        result = self.cache_controller.get_counter(key)
        return response_result(content=result)

    @blp.response(200, RspMsgDictSchema)
    @jwt_required()
    def post(self):
        """
        操作计数器

        Body 参数:
            key: 计数器键名
            action: 操作类型（incr/decr/set/reset）
            amount: 增减数量，默认 1
            ttl: 过期时间（秒），可选
        """
        data = request.get_json() or {}
        key = data.get("key", "counter:default")
        action = data.get("action", "incr")
        amount = data.get("amount", 1)
        ttl = data.get("ttl")

        try:
            result = self.cache_controller.operate_counter(
                key, action, amount, ttl)
            return response_result(content=result)
        except ValueError as e:
            raise ValidationException(msg=str(e))


@blp.route("/redis/set")
class RedisSetApi(MethodView):
    """
    Redis Set 集合操作接口

    演示功能：
    - SADD/SREM/SMEMBERS 操作
    - 适用于：标签系统、好友关系、去重列表等
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        获取集合数据

        Query 参数:
            key: 集合键名
        """
        key = request.args.get("key")
        if not key:
            raise ValidationException(msg="集合键名不能为空")

        result = self.cache_controller.get_set_members(key)
        return response_result(content=result)

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def post(self):
        """
        添加集合成员

        Body 参数:
            key: 集合键名
            members: 成员列表
        """
        data = request.get_json() or {}
        key = data.get("key")
        members = data.get("members", [])

        if not key:
            raise ValidationException(msg="集合键名不能为空")

        count = self.cache_controller.add_set_members(key, members)
        return response_result(msg=f"添加了 {count} 个成员")

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self):
        """
        删除集合成员

        Body 参数:
            key: 集合键名
            members: 要删除的成员列表
        """
        data = request.get_json() or {}
        key = data.get("key")
        members = data.get("members", [])

        if not key:
            raise ValidationException(msg="集合键名不能为空")

        removed = self.cache_controller.remove_set_members(key, members)
        return response_result(msg=f"删除了 {removed} 个成员")


@blp.route("/redis/zset")
class RedisZSetApi(MethodView):
    """
    Redis Sorted Set 有序集合操作接口

    演示功能：
    - ZADD/ZRANGE 操作
    - 适用于：排行榜、优先级队列、时间线等
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        获取排行榜数据

        Query 参数:
            key: 有序集合键名
            start: 起始位置，默认 0
            end: 结束位置，默认 9（前10名）
            withscores: 是否返回分数，默认 true
        """
        key = request.args.get("key")
        start = int(request.args.get("start", 0))
        end = int(request.args.get("end", 9))
        withscores = request.args.get("withscores", "true").lower() == "true"

        if not key:
            raise ValidationException(msg="键名不能为空")

        result = self.cache_controller.get_zset_range(
            key, start, end, withscores)
        return response_result(content=result)

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def post(self):
        """
        添加排行榜数据

        Body 参数:
            key: 有序集合键名
            members: 成员分数字典，如 {"user1": 100, "user2": 200}
        """
        data = request.get_json() or {}
        key = data.get("key")
        members = data.get("members", {})

        if not key:
            raise ValidationException(msg="键名不能为空")
        if not members:
            raise ValidationException(msg="成员数据不能为空")

        added = self.cache_controller.add_zset_members(key, members)
        return response_result(msg=f"添加/更新了 {added} 个成员")


@blp.route("/redis/batch")
class RedisBatchApi(MethodView):
    """
    Redis 批量操作接口

    演示功能：
    - MSET/MGET 批量操作
    - 适用于：批量数据加载、缓存预热等
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        批量获取数据

        Query 参数:
            keys: 键名列表，逗号分隔
        """
        keys_str = request.args.get("keys", "")
        if not keys_str:
            raise ValidationException(msg="键名列表不能为空")

        keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        result = self.cache_controller.batch_get(keys)
        return response_result(content=result)

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def post(self):
        """
        批量设置数据

        Body 参数:
            data: 键值对字典，如 {"key1": "value1", "key2": "value2"}
        """
        data = request.get_json() or {}
        kv_data = data.get("data", {})

        if not kv_data:
            raise ValidationException(msg="数据不能为空")

        count = self.cache_controller.batch_set(kv_data)
        return response_result(msg=f"批量设置了 {count} 个键")

    @blp.response(200, RspMsgSchema)
    @jwt_required()
    def delete(self):
        """
        批量删除数据（按模式匹配）

        Query 参数:
            pattern: 键名模式，如 "cache:*"
        """
        pattern = request.args.get("pattern")
        if not pattern:
            raise ValidationException(msg="模式不能为空")

        # 安全检查：防止误删所有数据
        if pattern == "*":
            raise ValidationException(msg="不允许删除所有数据")

        deleted = self.cache_controller.batch_delete(pattern)
        return response_result(msg=f"删除了 {deleted} 个键")


# =============================================================================
# 缓存装饰器样例
# =============================================================================

@blp.route("/cache/decorator")
class CacheDecoratorApi(MethodView):
    """
    缓存装饰器使用样例

    演示功能：
    - @cache_result 装饰器自动缓存函数结果
    - 首次调用执行函数并缓存
    - 后续调用直接返回缓存结果
    - TTL 过期后重新执行函数
    """

    def __init__(self):
        self.cache_controller = CacheController()

    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """
        测试缓存装饰器

        Query 参数:
            param: 测试参数
            type: 测试类型（basic/user_info）
        """
        param = request.args.get("param", "default")
        test_type = request.args.get("type", "basic")

        # 调用 Controller 处理业务逻辑
        result = self.cache_controller.test_cache_decorator(param, test_type)
        return response_result(content=result)
