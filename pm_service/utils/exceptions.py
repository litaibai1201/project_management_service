# -*- coding: utf-8 -*-
"""
@文件: exceptions.py
@说明: 统一的业务异常定义
@时间: 2026/02/07

状态码规范：
==========
格式: [S/F][类别][序号]
- S: Success 成功
- F: Failure 失败

类别编码：
- 10xxx: 通用状态码
- 20xxx: 用户/认证相关
- 30xxx: 权限相关
- 40xxx: 资源相关
- 50xxx: 业务逻辑相关
- 60xxx: 外部服务相关
- 70xxx: 数据相关

详细状态码说明：
=============

通用状态码 (10xxx):
- S10000: 请求成功
- F10001: 请求失败（通用错误）
- F10002: 参数验证失败
- F10003: 请求格式错误
- F10004: 请求超时
- F10005: 服务器内部错误

用户/认证相关 (20xxx):
- F20001: 用户未登录
- F20002: Token 无效或已过期
- F20003: 用户名或密码错误
- F20004: 账号已被禁用
- F20005: 账号已被锁定
- F20006: Token 刷新失败

权限相关 (30xxx):
- F30001: 权限不足
- F30002: 无权访问该资源
- F30003: 操作被拒绝
- F30004: IP 访问受限

资源相关 (40xxx):
- F40001: 资源不存在
- F40002: 资源已存在
- F40003: 资源已被删除
- F40004: 资源被锁定

业务逻辑相关 (50xxx):
- F50001: 业务处理失败
- F50002: 数据状态异常
- F50003: 操作条件不满足
- F50004: 并发冲突

外部服务相关 (60xxx):
- F60001: 外部服务调用失败
- F60002: 外部服务超时
- F60003: 外部服务不可用

数据相关 (70xxx):
- F70001: 数据库操作失败
- F70002: 缓存操作失败
- F70003: 数据格式错误

使用示例：
    from utils.exceptions import ValidationException, AuthenticationException

    # 在业务逻辑中抛出
    if not user:
        raise AuthenticationException(msg="用户不存在")

    # 由 error_handler.py 中的全局处理器捕获并返回统一 JSON 格式:
    # {"code": "F20001", "msg": "用户不存在", "content": {}}
"""


class APIException(Exception):
    """
    API 基异常类 - 所有业务异常的父类

    响应格式: {"code": "Fxxxxx", "msg": "错误信息", "content": {...}}
    """

    def __init__(self, code: str = "F10001", msg: str = "请求失败",
                 status_code: int = 500, content: dict = None):
        """
        Args:
            code: 业务状态码 (如 "F10001", "F20002")
            msg: 用户友好的错误消息
            status_code: HTTP 状态码 (400/401/403/404/500 等)
            content: 额外的错误上下文信息
        """
        self.code = code
        self.msg = msg
        self.status_code = status_code
        self.content = content or {}
        super().__init__(self.msg)


class ValidationException(APIException):
    """
    参数验证异常 - 请求参数格式/字段验证失败

    HTTP 状态码: 400
    默认业务码: F10002
    """

    def __init__(self, msg: str = "参数验证失败", code: str = "F10002", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=400, content=content)


class AuthenticationException(APIException):
    """
    身份验证异常 - 未登录或 Token 无效

    HTTP 状态码: 401
    默认业务码: F20001

    相关状态码:
    - F20001: 用户未登录
    - F20002: Token 无效或已过期
    - F20003: 用户名或密码错误
    """

    def __init__(self, msg: str = "用户未登录", code: str = "F20001", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=401, content=content)


class PermissionException(APIException):
    """
    权限异常 - 用户身份有效但权限不足

    HTTP 状态码: 403
    默认业务码: F30001

    相关状态码:
    - F30001: 权限不足
    - F30002: 无权访问该资源
    - F30003: 操作被拒绝
    """

    def __init__(self, msg: str = "权限不足", code: str = "F30001", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=403, content=content)


class ResourceNotFoundException(APIException):
    """
    资源不存在异常

    HTTP 状态码: 404
    默认业务码: F40001

    相关状态码:
    - F40001: 资源不存在
    - F40003: 资源已被删除
    """

    def __init__(self, msg: str = None, resource_type: str = "资源",
                 code: str = "F40001", content: dict = None):
        if msg is None:
            msg = f"{resource_type}不存在"
        super().__init__(code=code, msg=msg, status_code=404, content=content)


class ResourceExistsException(APIException):
    """
    资源已存在异常 - 创建时发现重复

    HTTP 状态码: 400
    默认业务码: F40002
    """

    def __init__(self, msg: str = None, resource_type: str = "资源",
                 code: str = "F40002", content: dict = None):
        if msg is None:
            msg = f"{resource_type}已存在"
        super().__init__(code=code, msg=msg, status_code=400, content=content)


class BusinessException(APIException):
    """
    业务逻辑异常 - 违反业务规则

    HTTP 状态码: 400
    默认业务码: F50001

    相关状态码:
    - F50001: 业务处理失败
    - F50002: 数据状态异常
    - F50003: 操作条件不满足
    """

    def __init__(self, msg: str = "业务处理失败", code: str = "F50001", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=400, content=content)


class ExternalServiceException(APIException):
    """
    外部服务异常 - 调用外部 API/服务失败

    HTTP 状态码: 502
    默认业务码: F60001

    相关状态码:
    - F60001: 外部服务调用失败
    - F60002: 外部服务超时
    - F60003: 外部服务不可用
    """

    def __init__(self, msg: str = "外部服务调用失败", code: str = "F60001", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=502, content=content)


class DatabaseException(APIException):
    """
    数据库异常 - 数据库操作失败

    HTTP 状态码: 500
    默认业务码: F70001
    """

    def __init__(self, msg: str = "数据库操作失败", code: str = "F70001", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=500, content=content)


class CacheException(APIException):
    """
    缓存异常 - Redis 等缓存操作失败

    HTTP 状态码: 500
    默认业务码: F70002
    """

    def __init__(self, msg: str = "缓存操作失败", code: str = "F70002", content: dict = None):
        super().__init__(code=code, msg=msg, status_code=500, content=content)


__all__ = [
    "APIException",
    "ValidationException",
    "AuthenticationException",
    "PermissionException",
    "ResourceNotFoundException",
    "ResourceExistsException",
    "BusinessException",
    "ExternalServiceException",
    "DatabaseException",
    "CacheException",
]
