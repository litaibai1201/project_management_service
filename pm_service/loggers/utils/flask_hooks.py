# -*- coding: utf-8 -*-
"""
@文件: flask_hooks.py
@说明: Flask 应用钩子 - 自动记录 HTTP 请求/响应和 SQL 查询日志
@时间: 2025-09-03

使用方法:
    from loggers.integrations.flask_hooks import flask_hooks
    
    # 在 create_app() 中初始化
    def create_app():
        app = Flask(__name__)
        db = SQLAlchemy(app)
        
        # 注册钩子(必须在 db.init_app 之后)
        flask_hooks.init_app(app, db)
        
        return app
"""
import json
import time
import base64
import uuid
from typing import Any, Callable, Dict, List, Optional

from ..core import logger

try:
    from flask import Flask, Response, g, request
    from flask_sqlalchemy import SQLAlchemy
    from sqlalchemy import event
except ImportError:
    pass

# SQL 事务语句(不需要记录)
SQL_STATE_TUPLE = ("BEGIN", "COMMIT", "ROLLBACK")


class FlaskHooksRegister:
    """
    Flask 钩子注册器: 自动记录 HTTP 请求/响应和 SQL 查询日志

    功能:
    1. 自动记录所有 API 请求和响应
    2. 自动记录所有 SQL 查询和执行时间
    3. 使用结构化日志格式
    4. 自动获取真实客户端 IP
    """

    def __init__(self):
        # 存储 Flask 钩子
        self.before_request_hooks: List[Callable] = []
        self.after_request_hooks: List[Callable[[Response], Response]] = []
        self.teardown_request_hooks: List[Callable] = []

        # 存储 DB 事件监听器
        self.db_listeners: List[Dict[str, Any]] = []

    def before_request(self, f: Callable) -> Callable:
        """装饰器: 收集 @app.before_request 钩子"""
        self.before_request_hooks.append(f)
        return f

    def after_request(
        self, f: Callable[[Response], Response]
    ) -> Callable[[Response], Response]:
        """装饰器: 收集 @app.after_request 钩子"""
        self.after_request_hooks.append(f)
        return f

    def teardown_request(self, f: Callable) -> Callable:
        """装饰器: 收集 @app.teardown_request 钩子"""
        self.teardown_request_hooks.append(f)
        return f

    def db_listen(self, identifier: str) -> Callable[[Callable], Callable]:
        """装饰器工厂: 收集 SQLAlchemy 数据库事件监听函数"""

        def decorator(fn: Callable) -> Callable:
            self.db_listeners.append({"identifier": identifier, "fn": fn})
            return fn

        return decorator

    def init_app(self, app: Flask, db: Optional[SQLAlchemy] = None, enable_db_logging: bool = False):
        """
        统一注册所有钩子和事件

        Args:
            app: Flask 应用实例
            db: SQLAlchemy 数据库实例(可选)
            enable_db_logging: 是否启用数据库日志记录,默认为 False
                - True: 记录所有 SQL 查询和执行时间
                - False: 不记录 SQL 日志

        ⚠️ 重要: 必须在 db.init_app(app) 之后调用！

        正确的初始化顺序:
            from flask import Flask
            from flask_sqlalchemy import SQLAlchemy
            from loggers.utils.flask_hooks import flask_hooks

            app = Flask(__name__)
            db = SQLAlchemy()

            # 1. 先初始化数据库
            db.init_app(app)

            # 2. 再注册钩子
            flask_hooks.init_app(app, db, enable_db_logging=True)

        使用示例:
            # 启用 HTTP 和 SQL 日志
            flask_hooks.init_app(app, db, enable_db_logging=True)

            # 只启用 HTTP 日志,不记录 SQL
            flask_hooks.init_app(app, db, enable_db_logging=False)

            # 只启用 HTTP 日志,不提供 db
            flask_hooks.init_app(app)
        """

        # A. 注册 Flask before/after/teardown 请求钩子
        for hook in self.before_request_hooks:
            app.before_request(hook)

        for hook in self.after_request_hooks:
            app.after_request(hook)

        for hook in self.teardown_request_hooks:
            app.teardown_request(hook)

        # B. 注册 SQLAlchemy 事件(如果提供了 db 且启用了数据库日志)
        if db and enable_db_logging and self.db_listeners:
            with app.app_context():
                try:
                    # 尝试获取 engine (兼容 Flask-SQLAlchemy 2.x 和 3.x)
                    try:
                        # Flask-SQLAlchemy 3.x (get_engine() 不需要参数)
                        engine_instance = db.get_engine()
                    except (AttributeError, TypeError):
                        # Flask-SQLAlchemy 2.x
                        engine_instance = db.engine
                    for listener in self.db_listeners:
                        event.listen(
                            target=engine_instance,
                            identifier=listener["identifier"],
                            fn=listener["fn"],
                        )

                    logger.info(
                        "数据库监听器注册成功",
                        category="business",
                        custom={
                            "listener_count": len(self.db_listeners),
                            "message": "SQL 查询日志已启用"
                        }
                    )
                except Exception as e:
                    logger.error(
                        "无法注册数据库监听器",
                        category="error", 
                        error=e,
                        custom={
                            "hint": "请确保在调用 flask_hooks.init_app() 之前已经执行了 db.init_app(app)"
                        }
                    )
        elif db and not enable_db_logging:
            logger.info(
                "数据库日志已禁用",
                category="business",
                custom={"message": "SQL 查询不会被记录"}
            )


# 创建全局钩子注册器实例
flask_hooks = FlaskHooksRegister()


def encode_to_base64(string):
    string_bytes = string.encode("utf-8")
    base64_bytes = base64.b64encode(string_bytes)
    base64_string = base64_bytes.decode("utf-8")
    return base64_string


def _extract_request_body(request):
    """提取和处理请求体"""
    if request.content_type and "multipart/form-data" in request.content_type:
        # 处理文件上传
        for file in request.files.values():
            file.stream.seek(0)
        files_info = {
            name: {
                "filename": file.filename,
                "size": len(file.read()),
            }
            for name, file in request.files.items()
        }
        for file in request.files.values():
            file.stream.seek(0)
        return {
            "form": request.form.to_dict(),
            "files": files_info,
        }
    else:
        # 处理JSON请求
        req_body = request.get_data(as_text=True)
        if req_body:
            try:
                req_body = json.loads(req_body)
                if "password" in req_body:
                    req_body["password"] = encode_to_base64(["password"])
            except Exception:
                pass
        return req_body


@flask_hooks.before_request
def _log_request_start():
    """钩子: 记录请求开始时间和请求详情"""
    try:
        # 记录开始时间
        g.start_time = time.time()
        g.request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        g.remote_addr = request.remote_addr
        g.root_url = request.root_url

        # 记录结构化日志
        logger.info(
            f"HTTP 请求开始: {request.method} {request.path}",
            event="http_request_start",
            category="http",
            req={
                "method": request.method,
                "path": request.path,
                "headers": {k: v for k, v in request.headers.items()},
                "body": _extract_request_body(request)
            },
            custom={
                "request_id": g.request_id,
                "remote_addr": g.remote_addr,
                "root_url": g.root_url,
            }
        )
    except Exception as e:
        logger.error(
            "记录请求开始失败",
            category="error",
            error=e
        )


@flask_hooks.after_request
def _log_request_end(resp: Response) -> Response:
    """钩子: 记录响应信息和请求耗时"""
    duration_ms = 0
    try:
        if request.method == "OPTIONS":
            return resp
        # 计算请求耗时
        duration_ms = round((time.time() - getattr(g, 'start_time', time.time())) * 1000, 2)

        # 解析响应体
        response_body = None
        if resp.content_length and resp.content_length < 20 * 1024:  # 小于 20KB
            try:
                response_body = json.loads(resp.data) if resp.data else None

                # 处理字段验证错误(code=422)
                if isinstance(response_body, dict) and response_body.get("code") == 422:
                    err_descs = ["field error"]
                    errors = response_body.get("errors") or {}
                    error_json = errors.get("json") or {}
                    for field, messages in error_json.items():
                        for msg in messages:
                            err_descs.append(f"{field}:{msg}")

                    response_body = {
                        "code": "F10001",
                        "msg": "；".join(err_descs),
                        "content": errors
                    }
                    resp.data = json.dumps(response_body, ensure_ascii=False)
            except Exception:
                response_body = {
                    "code": "F10001",
                    "msg": "无法解析响应体",
                    "content": {}
                }
        elif resp.content_length and resp.content_length >= 20 * 1024:
            response_body = {
                "code": "F10001",
                "msg": "响应体过大,未记录",
                "content": {}
            }

        # 记录结构化日志
        log_level = "warning" if resp.status_code >= 400 else "info"
        log_method = getattr(logger, log_level)

        log_method(
            f"HTTP 请求完成: {request.method} {request.path} - {resp.status_code}",
            event="http_request_complete",
            category="http",
            resp={
                "status_code": resp.status_code,
                "body": response_body,
                "event_duration": duration_ms / 1000  # 转换为秒
            },
            custom={
                "request_id": g.request_id,
                "remote_addr": g.remote_addr,
                "root_url": g.root_url,
                "duration_ms": duration_ms,
                "content_length": resp.content_length or 0,
            }
        )
    except Exception as e:
        logger.error(
            "记录请求结束失败",
            category="error",
            error=e
        )
    finally:
        # 清理上下文(可选,取决于是否需要在请求间保持某些上下文)
        # logger.clear_context()
        pass
    # 将 trace_id 添加到响应头，方便前端追踪
    resp.headers["X-Trace-Id"] = logger.get_trace_id()
    resp.headers['X-Request-ID'] = g.get('request_id', 'unknown')
    resp.headers['X-Response-Time'] = f"{duration_ms}ms"
    return resp


@flask_hooks.db_listen(identifier="before_cursor_execute")
def _sql_before_execute(conn, cursor, statement, parameters, context, executemany):
    """SQL 执行前: 记录开始时间"""
    try:
        # 忽略事务语句
        if statement.startswith(SQL_STATE_TUPLE):
            return

        # 使用 Flask 的 g 对象存储开始时间
        g.sql_start_time = time.time()
    except Exception:
        pass


@flask_hooks.db_listen(identifier="after_cursor_execute")
def _sql_after_execute(conn, cursor, statement, parameters, context, executemany):
    """SQL 执行后: 计算耗时并记录日志"""
    try:
        # 获取开始时间
        sql_start_time = getattr(g, 'sql_start_time', None)

        # 忽略事务语句或没有开始时间的情况
        if statement.startswith(SQL_STATE_TUPLE) or not sql_start_time:
            return

        # 计算耗时
        duration_ms = (time.time() - sql_start_time) * 1000

        # 清理 SQL 语句(移除换行符)
        sql_str = statement.replace("\\n", " ").replace("\n", " ").strip()

        # 推断 SQL 类型
        statement_type = None
        for sql_type in ["SELECT", "INSERT", "UPDATE", "DELETE"]:
            if sql_str.upper().startswith(sql_type):
                statement_type = sql_type
                break

        # 记录结构化日志（只使用 db 字段，符合 DatabaseModel）
        log_level = "warning" if duration_ms > 1000 else "info"  # 超过1秒警告
        log_method = getattr(logger, log_level)

        log_method(
            f"SQL 命令: {statement_type or 'UNKNOWN'}",
            event=f"database-{statement_type}",
            category="database",
            db={
                "statement": sql_str,
                "statement_type": statement_type,
                "status": "success",
                "duration": duration_ms / 1000,  # 转换为秒
                "row_count": cursor.rowcount if hasattr(cursor, 'rowcount') else None
            }
        )
    except Exception:
        pass
    finally:
        # 清理 g 对象中的 SQL 临时数据
        if hasattr(g, 'sql_start_time'):
            delattr(g, 'sql_start_time')


@flask_hooks.db_listen(identifier="handle_error")
def _sql_handle_error(exception_context):
    """SQL 执行错误: 记录失败的查询"""
    try:
        # 从 exception_context 获取 SQL 信息
        statement = exception_context.statement
        if not statement or statement.startswith(SQL_STATE_TUPLE):
            return

        # 获取开始时间
        sql_start_time = getattr(g, 'sql_start_time', None)

        # 计算耗时
        duration_ms = (time.time() - sql_start_time) * 1000 if sql_start_time else 0

        # 清理 SQL 语句
        sql_str = statement.replace("\\n", " ").replace("\n", " ").strip()

        # 推断 SQL 类型
        statement_type = None
        for sql_type in ["SELECT", "INSERT", "UPDATE", "DELETE"]:
            if sql_str.upper().startswith(sql_type):
                statement_type = sql_type
                break

        # 记录错误日志（只使用 db 字段，符合 DatabaseModel）
        logger.error(
            f"SQL 执行失败: {statement_type or 'UNKNOWN'}",
            event=f"database-{statement_type}-error",
            category="database",
            db={
                "statement": sql_str[:500],  # 限制长度
                "statement_type": statement_type,
                "status": "failed",
                "duration": duration_ms / 1000,
                "row_count": 0
            }
        )
    except Exception:
        pass
    finally:
        # 清理 g 对象中的 SQL 临时数据
        if hasattr(g, 'sql_start_time'):
            delattr(g, 'sql_start_time')


@flask_hooks.teardown_request
def _teardown_request_context(exception=None):
    """请求结束后清理上下文

    在请求完全结束后调用，无论是否发生异常。
    用于清理线程级别的日志上下文，避免在线程池复用时污染下一个请求。

    Args:
        exception: 如果请求处理过程中发生异常，会传入异常对象，否则为 None
    """
    try:
        # 清理日志上下文（trace_id、transaction_id 等）
        logger.clear_context()
    except Exception:
        # 清理失败不应该影响请求处理
        pass
