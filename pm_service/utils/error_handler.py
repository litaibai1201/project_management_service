# -*- coding: utf-8 -*-
"""
@文件: error_handler.py
@说明: 全局错误处理器 - 统一捕获和记录所有 HTTP 错误和业务异常
@时间: 2026/02/07 (assistant)

处理两类错误：
1. HTTP 标准错误（400/401/403/404/500）- 由 Flask 框架自动触发或开发者主动抛出
2. 业务异常（APIException 及其子类）- 由业务代码主动抛出，转换为对应的 HTTP 响应

处理流程：
    业务代码
      ├─> raise APIException / ValidationException / ... 
      │   └─> error_handler 捕获 → 转换为 HTTP 响应 + 结构化日志
      │
      └─> 其他未处理异常
          └─> Flask 500 处理器捕获
"""
from flask import jsonify, g, request
from loggers import logger
from utils.response import fail_response_result
from utils.exceptions import APIException


def register_error_handlers(app):
    """
    注册全局错误处理器到 Flask 应用
    
    处理的错误类型：
    - APIException（及其子类）: 业务异常，由业务代码主动抛出
    - 400: 客户端请求错误（验证失败等）
    - 401: 未授权（缺少或无效的身份验证）
    - 403: 禁止访问（权限不足）
    - 404: 资源不存在
    - 500: 服务器内部错误（未捕获的异常）
    
    使用方式：
        在 app.py 的 create_app() 中调用：
        register_error_handlers(app)
    """
    
    @app.errorhandler(APIException)
    def handle_api_exception(error: APIException):
        """
        处理业务异常 - 由业务逻辑主动抛出的异常

        响应格式: {"code": "Fxxxxx", "msg": "错误信息", "content": {...}}
        """
        logger.warning(
            f"业务异常: {error.code}",
            category="error",
            event="api_exception",
            custom={
                "code": error.code,
                "message": error.msg,
                "status_code": error.status_code,
                "request_id": g.get('request_id', 'unknown'),
                "path": request.path,
                "method": request.method,
                "content": error.content
            }
        )

        return fail_response_result(msg=error.msg, code=error.code, content=error.content), error.status_code
    
    @app.errorhandler(400)
    def bad_request(error):
        """处理 400 错误：客户端请求错误"""
        logger.warning(
            "客户端请求错误",
            category="error",
            event="client_error_400",
            custom={
                "status_code": 400,
                "error_message": str(error),
                "request_id": g.get('request_id', 'unknown'),
                "path": request.path,
                "method": request.method
            }
        )
        return fail_response_result(msg="Bad Request", code="F40000"), 400
    
    @app.errorhandler(401)
    def unauthorized(error):
        """处理 401 错误：未授权访问"""
        logger.warning(
            "未授权请求",
            category="security",
            event="unauthorized_401",
            custom={
                "status_code": 401,
                "error_message": str(error),
                "request_id": g.get('request_id', 'unknown'),
                "path": request.path,
                "method": request.method,
                "has_auth_header": 'Authorization' in request.headers
            }
        )
        return fail_response_result(msg="Unauthorized", code="F40100"), 401
    
    @app.errorhandler(403)
    def forbidden(error):
        """处理 403 错误：禁止访问"""
        logger.warning(
            "禁止访问",
            category="security",
            event="forbidden_403",
            custom={
                "status_code": 403,
                "error_message": str(error),
                "request_id": g.get('request_id', 'unknown'),
                "path": request.path,
                "remote_addr": request.remote_addr
            }
        )
        return fail_response_result(msg="Forbidden", code="F40300"), 403
    
    @app.errorhandler(404)
    def not_found(error):
        """处理 404 错误：资源不存在"""
        logger.info(
            "资源不存在",
            category="http",
            event="not_found_404",
            custom={
                "status_code": 404,
                "request_id": g.get('request_id', 'unknown'),
                "path": request.path,
                "method": request.method
            }
        )
        return fail_response_result(msg="Not Found", code="F40400"), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """处理 500 错误：服务器内部错误"""
        request_id = g.get('request_id', 'unknown')
        
        # 记录详细的错误信息
        logger.error(
            "服务器内部错误",
            category="error",
            event="internal_error_500",
            error=error,
            custom={
                "status_code": 500,
                "request_id": request_id,
                "path": request.path,
                "method": request.method,
                "remote_addr": request.remote_addr
            }
        )
        
        # 返回错误响应，包含 request_id 便于前端查询日志
        return fail_response_result(
            msg="Internal Server Error",
            code="F50000",
            content={"request_id": request_id}
        ), 500
