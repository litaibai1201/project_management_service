# -*- coding: utf-8 -*-
"""
@文件: config_controller.py
@说明: 配置控制器 - 提供非敏感配置聚合
@时间: 2026/02/09
"""

from configs.base import BaseConfig
from typing import Dict


class ConfigController:
    """配置控制器"""

    def get_public_config(self) -> Dict[str, object]:
        """返回非敏感的配置信息"""
        return {
            "api_title": BaseConfig.API_TITLE,
            "api_version": BaseConfig.API_VERSION,
            "page_size_default": BaseConfig.PAGE_SIZE_DEFAULT,
            "page_size_max": BaseConfig.PAGE_SIZE_MAX,
            "cache_default_timeout": BaseConfig.CACHE_DEFAULT_TIMEOUT,
            "request_timeout": BaseConfig.REQUEST_TIMEOUT,
            "upload_allowed_extensions": list(BaseConfig.UPLOAD_ALLOWED_EXTENSIONS),
        }
