# -*- coding: utf-8 -*-
"""
增强 API 文档配置（基于 flask-smorest）

功能：
- 设置 OpenAPI 元信息（title/version/description）
- 注入安全定义（JWT Bearer）到 OpenAPI 文档
- 提供可扩展的钩子以添加全局响应示例或通用 header
"""
from typing import Optional
import os
import importlib
import inspect
from marshmallow import Schema as MarshmallowSchema


def register_marshmallow_schemas(api, package_path: str = "serializes"):
    """扫描指定包（相对项目根），将所有 marshmallow.Schema 子类注册到 OpenAPI components.

    Args:
        api: flask_smorest.Api 实例
        package_path: 相对于工程根的包路径，例如 `serializes` 或 `common.serializers`
    """
    # 构建文件系统路径
    base_dir = os.path.join(os.getcwd(), package_path)
    if not os.path.isdir(base_dir):
        return 0

    registered = 0
    for fname in os.listdir(base_dir):
        if not fname.endswith('.py') or fname.startswith('__'):
            continue
        mod_name = f"{package_path}.{fname[:-3]}"
        try:
            mod = importlib.import_module(mod_name)
        except Exception:
            continue

        for _, member in inspect.getmembers(mod, inspect.isclass):
            try:
                if issubclass(member, MarshmallowSchema) and member is not MarshmallowSchema:
                    schema_name = member.__name__
                    # 注册 schema 到 apispec components
                    try:
                        api.spec.components.schema(schema_name, schema=member)
                        registered += 1
                    except Exception:
                        # 有些 apispec 版本/插件配置可能不接受 class，尝试实例化
                        try:
                            api.spec.components.schema(schema_name, schema=member())
                            registered += 1
                        except Exception:
                            pass
            except Exception:
                continue

    return registered



def enhance_api_docs(app, api, *, title: Optional[str] = None, version: Optional[str] = None, description: Optional[str] = None):
    """为应用与 `flask_smorest.Api` 注入增强的 OpenAPI 配置。

    仅设置 app.config 中的键，`flask_smorest` 在初始化时会读取这些配置用于生成 OpenAPI 文档。
    """
    # 基本信息
    app.config.setdefault('API_TITLE', title or app.config.get('API_TITLE', 'ALARM SERVER REST API'))
    app.config.setdefault('API_VERSION', version or app.config.get('API_VERSION', 'v1'))
    app.config.setdefault('OPENAPI_VERSION', app.config.get('OPENAPI_VERSION', '3.0.3'))

    # 更丰富的说明（可包含 Markdown）
    default_description = (
        app.config.get('OPENAPI_INFO_OBJECT', {})
            .get('description') if isinstance(app.config.get('OPENAPI_INFO_OBJECT', {}), dict) else None
    )
    app.config.setdefault('OPENAPI_INFO_OBJECT', app.config.get('OPENAPI_INFO_OBJECT', {}) or {})
    if description:
        app.config['OPENAPI_INFO_OBJECT']['description'] = description
    elif not default_description:
        app.config['OPENAPI_INFO_OBJECT']['description'] = (
            "API 文档 — 使用 JWT Bearer Token 认证。\n\n"
            "在 Swagger 中点击右上角的 Authorize 输入 `Bearer <token>` 来进行试验。"
        )

    # OpenAPI 安全定义（JWT Bearer）
    # flask-smorest 会将此配置映射到 OpenAPI schema
    app.config.setdefault('OPENAPI_SECURITY_SCHEMES', {})
    app.config['OPENAPI_SECURITY_SCHEMES'].setdefault('bearerAuth', {
        'type': 'http',
        'scheme': 'bearer',
        'bearerFormat': 'JWT'
    })

    # 在 swagger-ui 中显示 auth（若 flask-smorest 版本支持）
    # 若需要更多自定义（如全局响应、通用 header），可以在此处扩展

    # 在 api 已创建时额外注册 marshmallow schemas（将 serializes 包中的 Schema 注入 components）
    try:
        register_marshmallow_schemas(api, package_path='serializes')
    except Exception:
        pass

    return True


__all__ = ['enhance_api_docs']
