# -*- coding: utf-8 -*-
"""
@文件: models.py
@说明: 日志数据模型定义
@时间: 2025-09-03
"""
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict


class ServiceModel(BaseModel):
    """服务信息模型"""
    name: str
    environment: str

    model_config = ConfigDict(extra="forbid")


class TraceModel(BaseModel):
    """链路追踪ID模型"""
    id: str

    model_config = ConfigDict(extra="forbid")


class TransactionModel(BaseModel):
    """事务ID模型"""
    id: str

    model_config = ConfigDict(extra="forbid")


class HTTPRequestModel(BaseModel):
    """HTTP请求模型"""
    method: str
    path: str
    headers: Dict[str, Any]
    body: Any

    model_config = ConfigDict(extra="forbid")


class HTTPResponseModel(BaseModel):
    """HTTP响应模型"""
    status_code: int
    body: Any
    event_duration: float

    model_config = ConfigDict(extra="forbid")


class DatabaseModel(BaseModel):
    """数据库操作模型 - 扩展版本"""
    statement: str
    statement_type: Optional[str] = None  # SELECT, INSERT, UPDATE, DELETE
    table: Optional[str] = None  # 操作的表名
    status: str
    duration: float
    row_count: Optional[int] = None  # 返回或影响的行数
    db_name: Optional[str] = None  # 数据库名称

    model_config = ConfigDict(extra="forbid")


class ErrorModel(BaseModel):
    """错误信息模型"""
    message: str
    error_type: Optional[str] = None
    error_code: Optional[str] = None
    stack_trace: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(extra="allow")


class LogModel(BaseModel):
    """主日志模型 - 定义完整的日志结构"""
    message: str  # 日志消息（必需）
    event: Optional[str] = None  # 事件名称（可选）
    category: Optional[Literal[
        "http",
        "business",
        "database",
        "validation",
        "error",
        "performance",
        "audit"
    ]] = None  # 分类（可选）
    service: Optional[ServiceModel] = None
    client_ip: Optional[str] = None
    trace: Optional[TraceModel] = None
    transaction: Optional[TransactionModel] = None
    req: Optional[HTTPRequestModel] = None
    resp: Optional[HTTPResponseModel] = None
    db: Optional[DatabaseModel] = None
    custom: Optional[Dict[str, Any]] = None
    error: Optional[ErrorModel] = None

    model_config = ConfigDict(extra="allow")  # 允许额外字段，提供更大灵活性
