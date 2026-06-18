# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 日志模块导出
@时间: 2025-09-03
"""

from .core import (
    configure_logger,
    LoggerConfig,
    LogContext,
    logger,
    LogModel,
    ServiceModel,
    TraceModel,
    TransactionModel,
    HTTPRequestModel,
    HTTPResponseModel,
    DatabaseModel,
    ErrorModel,
)
from .core.logger import get_queue_handler_status
from .utils import (
    LogExecutionTime,
    AutoLog,
    flask_hooks,
    FlaskHooksRegister
)

__all__ = [
    "configure_logger",
    "LoggerConfig",
    "LogContext",
    "logger",
    "get_queue_handler_status",
    "LogExecutionTime",
    "AutoLog",
    "LogModel",
    "ServiceModel",
    "TraceModel",
    "TransactionModel",
    "HTTPRequestModel",
    "HTTPResponseModel",
    "DatabaseModel",
    "ErrorModel",
    "flask_hooks",
    "FlaskHooksRegister",
]

# 在所有模块导入完成后初始化日志系统
# 此时 loggers.core.handlers 已可被 logging.config.dictConfig 解析
configure_logger()
