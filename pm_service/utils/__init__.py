# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 工具模块导出
@时间: 2026/02/07
"""

from .auth import AuthManager, create_token, jwt_required, get_identity
from .error_handler import register_error_handlers
from .rate_limit import limiter, init_app as init_rate_limit
from .api_docs_enhanced import enhance_api_docs
from .cache_decorator import cache_result
from .ftp_client import FTPClient
from .ini_file import IniConfigReaderMethod
from .zip_file import ZipMethod
from .response import response_result, fail_response_result
from .tools import TryExcept, CommonTools, ReadConf, get_time
from .exceptions import (
    APIException,
    ValidationException,
    AuthenticationException,
    PermissionException,
    ResourceNotFoundException,
    ResourceExistsException,
    BusinessException,
    ExternalServiceException,
    DatabaseException,
    CacheException,
)

__all__ = [
    # 认证
    "AuthManager",
    "create_token",
    "jwt_required",
    "get_identity",
    # 错误处理
    "register_error_handlers",
    # 速率限制
    "limiter",
    "init_rate_limit",
    # API 文档
    "enhance_api_docs",
    # 缓存
    "cache_result",
    # FTP 客户端
    "FTPClient",
    # INI 配置读取
    "IniConfigReaderMethod",
    # ZIP 文件处理
    "ZipMethod",
    # 响应方法
    "response_result",
    "fail_response_result",
    # 工具类
    "TryExcept",
    "CommonTools",
    "ReadConf",
    "get_time",
    # 异常类
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
