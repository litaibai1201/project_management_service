# -*- coding: utf-8 -*-
"""
@文件: decorators.py
@说明: 通用日志装饰器 - 用于性能监控和自动日志记录
@时间: 2025-09-03
"""
import functools
import inspect
import time
import traceback
from typing import Any, Callable, Dict, List, Optional, Union

from ..core.context import logger


class LogExecutionTime:
    """执行时间装饰器 - 记录函数执行时间

    适用于任何需要监控执行时间的函数，不限于数据库操作。
    """

    @staticmethod
    def track(
        slow_threshold: Optional[float] = None,
        category: str = "performance"
    ) -> Callable:
        """
        装饰器：追踪函数执行时间

        Args:
            slow_threshold: 慢执行阈值（秒），超过此值会记录warning日志。默认为None（不检查）
            category: 日志分类，默认为 "performance"

        Usage:
            @LogExecutionTime.track(slow_threshold=1.0)
            def search_employees(keyword):
                # 函数体
                pass

            @LogExecutionTime.track(slow_threshold=0.5, category="business")
            def process_order(order_id):
                # 函数体
                pass
        """
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                start_time = time.time()

                try:
                    result = func(*args, **kwargs)
                    duration = time.time() - start_time

                    # 如果设置了阈值且超过阈值，记录警告日志
                    if slow_threshold is not None and duration > slow_threshold:
                        logger.warning(
                            f"函数执行缓慢: {func.__name__}",
                            category=category,
                            custom={
                                "function": func.__name__,
                                "module": func.__module__,
                                "duration": round(duration, 3),
                                "threshold": slow_threshold,
                                "args_count": len(args),
                                "kwargs_keys": list(kwargs.keys()),
                                "status": "slow"
                            }
                        )
                    else:
                        # 正常执行，记录 info 日志
                        logger.info(
                            f"函数执行完成: {func.__name__}",
                            category=category,
                            custom={
                                "function": func.__name__,
                                "module": func.__module__,
                                "duration": round(duration, 3),
                                "status": "success"
                            }
                        )

                    return result

                except Exception as e:
                    duration = time.time() - start_time
                    logger.error(
                        f"函数执行失败: {func.__name__}",
                        error=e,
                        custom={
                            "function": func.__name__,
                            "duration": round(duration, 3),
                            "status": "failed"
                        }
                    )
                    raise

            return wrapper
        return decorator


def AutoLog(
    _func: Optional[Callable] = None,
    *,
    event: Optional[str] = None,
    category: str = "business",
    log_args: Optional[List[str]] = None,
    sensitive_args: Optional[List[str]] = None,
    log_result: bool = True,
    log_start: bool = True,
    log_end: bool = True,
    result_max_length: int = 500,
    slow_threshold: Optional[float] = None,
    logger_name: Optional[str] = None,
):
    """自动日志装饰器 - 自动记录方法的执行过程

    无需在方法内部编写日志代码，装饰器自动记录：
    - 函数开始执行（带参数）
    - 函数成功完成（带返回值摘要和执行时间）
    - 函数执行失败（带异常信息和堆栈）

    支持上下文管理：自动继承 trace_id、transaction_id 等上下文信息。

    Usage:
        # 最简用法（不带括号）
        @AutoLog
        def process_data(data_id):
            return {"status": "success"}

        # 带括号
        @AutoLog()
        def process_data(data_id):
            return {"status": "success"}

        # 完整配置
        @AutoLog(
            event="user_login",
            category="audit",
            log_args=["work_no", "location"],  # 要记录的参数（None=全部）
            sensitive_args=["password"],        # 敏感参数（脱敏处理）
            log_result=True,                    # 记录返回值
            log_start=True,                     # 记录开始
            log_end=True,                       # 记录结束
            slow_threshold=1.0,                 # 慢执行阈值（秒）
            logger_name="my.custom",            # 指定 logger 名称
        )
        def authenticate(work_no, password, location):
            ...

    Args:
        _func: 被装饰的函数（支持 @AutoLog 不带括号）
        event: 事件名称，默认使用函数名
        category: 日志分类，默认 "business"
        log_args: 要记录的参数列表，None 表示记录所有非敏感参数
        sensitive_args: 敏感参数列表（会脱敏处理，如 password）
        log_result: 是否记录返回值
        log_start: 是否记录函数开始
        log_end: 是否记录函数结束
        result_max_length: 返回值字符串最大长度（超出截断）
        slow_threshold: 慢执行阈值（秒），超过会记录 warning
        logger_name: 指定 logger 名称，默认使用全局 logger
    """
    # 默认敏感参数
    if sensitive_args is None:
        sensitive_args = ["password", "token", "secret", "key", "credential", "pwd"]

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 动态获取 logger（保持上下文传递）
            from ..core.context import LogContext
            if logger_name:
                _logger = LogContext(logger_name)
            else:
                _logger = logger

            # 获取函数信息
            func_name = func.__name__
            module_name = func.__module__
            event_name = event or func_name

            # 提取参数
            call_args = _extract_args(func, args, kwargs, log_args, sensitive_args)

            # 记录开始
            if log_start:
                _logger.info(
                    f"{func_name} 开始执行",
                    event=f"{event_name}_start",
                    category=category,
                    custom={
                        "function": func_name,
                        "module": module_name,
                        "args": call_args,
                    }
                )

            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                duration = round(time.time() - start_time, 3)

                # 记录结束
                if log_end:
                    result_summary = _summarize_result(result, result_max_length) if log_result else None

                    # 判断是否慢执行
                    is_slow = slow_threshold and duration > slow_threshold
                    log_method = _logger.warning if is_slow else _logger.info

                    custom_data = {
                        "function": func_name,
                        "module": module_name,
                        "duration": duration,
                        "status": "slow" if is_slow else "success",
                    }
                    if result_summary is not None:
                        custom_data["result"] = result_summary

                    log_method(
                        f"{func_name} {'执行缓慢' if is_slow else '执行成功'}",
                        event=f"{event_name}_{'slow' if is_slow else 'success'}",
                        category=category,
                        custom=custom_data
                    )

                return result

            except Exception as e:
                duration = round(time.time() - start_time, 3)

                _logger.error(
                    f"{func_name} 执行失败: {str(e)}",
                    event=f"{event_name}_failed",
                    category=category,
                    error={
                        "message": str(e),
                        "error_type": type(e).__name__,
                        "stack_trace": traceback.format_exc(),
                    },
                    custom={
                        "function": func_name,
                        "module": module_name,
                        "duration": duration,
                        "args": call_args,
                        "status": "failed",
                    }
                )
                raise

        return wrapper

    # 支持 @AutoLog 不带括号的用法
    if _func is not None:
        return decorator(_func)

    return decorator


def _extract_args(
    func: Callable,
    args: tuple,
    kwargs: dict,
    log_args: Optional[List[str]],
    sensitive_args: List[str]
) -> Dict[str, Any]:
    """提取并处理函数参数"""
    # 获取函数签名
    sig = inspect.signature(func)
    params = list(sig.parameters.keys())

    # 合并 args 和 kwargs
    call_args = {}

    # 处理位置参数
    for i, value in enumerate(args):
        if i < len(params):
            param_name = params[i]
            # 跳过 self/cls
            if param_name in ("self", "cls"):
                continue
            call_args[param_name] = value

    # 处理关键字参数
    call_args.update(kwargs)

    # 过滤参数
    if log_args is not None:
        # 只保留指定的参数
        call_args = {k: v for k, v in call_args.items() if k in log_args}

    # 脱敏处理
    for key in list(call_args.keys()):
        if _is_sensitive(key, sensitive_args):
            call_args[key] = "***"

    # 简化参数值
    return {k: _simplify_value(v) for k, v in call_args.items()}


def _is_sensitive(param_name: str, sensitive_args: List[str]) -> bool:
    """判断参数是否敏感"""
    param_lower = param_name.lower()
    for sensitive in sensitive_args:
        if sensitive.lower() in param_lower:
            return True
    return False


def _simplify_value(value: Any, max_length: int = 100) -> Any:
    """简化值，避免日志过长"""
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        if len(value) > max_length:
            return value[:max_length] + "..."
        return value
    if isinstance(value, (list, tuple)):
        if len(value) > 10:
            return f"[{type(value).__name__}, len={len(value)}]"
        return [_simplify_value(v, max_length=50) for v in value[:10]]
    if isinstance(value, dict):
        if len(value) > 10:
            return f"{{dict, len={len(value)}}}"
        return {k: _simplify_value(v, max_length=50) for k, v in list(value.items())[:10]}
    # 其他类型
    str_value = str(value)
    if len(str_value) > max_length:
        return f"<{type(value).__name__}>"
    return str_value


def _summarize_result(result: Any, max_length: int) -> Any:
    """生成返回值摘要"""
    if result is None:
        return None

    # 布尔值直接返回
    if isinstance(result, bool):
        return result

    # 元组（常见的 return value, status 模式）
    if isinstance(result, tuple) and len(result) == 2:
        val, status = result
        if isinstance(status, bool):
            return {"value": _simplify_value(val, max_length), "success": status}

    return _simplify_value(result, max_length)
