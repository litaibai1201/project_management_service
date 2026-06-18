# -*- coding: utf-8 -*-
"""
@文件: log_conf.py
@说明: 日志系统配置 - 从 YAML 配置文件加载
@时间: 2025-09-03
"""
import os
from typing import Any, Dict

import yaml


def _get_config_path() -> str:
    """获取配置文件路径"""
    # 默认配置文件路径（与本文件同目录）
    default_path = os.path.join(os.path.dirname(__file__), 'logging.yaml')

    # 支持通过环境变量指定配置文件路径
    return os.environ.get('LOGGERS_CONFIG_PATH', default_path)


def _load_yaml_config() -> Dict[str, Any]:
    """从 YAML 文件加载配置"""
    config_path = _get_config_path()

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"日志配置文件不存在: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def _get_environment(yaml_default: str = 'dev') -> str:
    """获取运行环境配置

    优先级: APP_ENV > FLASK_ENV > YAML 配置
    自动映射: development -> dev, production -> prd
    """
    env = os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV')
    if env:
        # 统一映射 Flask 风格到简写
        env_mapping = {'development': 'dev', 'production': 'prd'}
        return env_mapping.get(env.lower(), env.lower())
    return yaml_default


def _get_service_name(yaml_default: str = 'DEFAULT_SERVICE') -> str:
    """获取服务名称配置

    优先级: APP_SERVICE_NAME > YAML 配置
    """
    return os.environ.get('APP_SERVICE_NAME', yaml_default)


def _build_logging_config(yaml_config: Dict[str, Any]) -> Dict[str, Any]:
    """将 YAML 配置转换为 logging.config.dictConfig 格式"""

    # 基础配置（环境变量优先，YAML 作为默认值）
    config = {
        'service_name': _get_service_name(yaml_config.get('service_name', 'DEFAULT_SERVICE')),
        'environment': _get_environment(yaml_config.get('environment', 'dev')),
        'use_queue_handler': yaml_config.get('use_queue_handler', False),
        'queue_size': yaml_config.get('queue_size', -1),
        'log_dir': yaml_config.get('log_dir', 'logs'),
        'archive_subdir': yaml_config.get('archive_subdir', 'archive'),
        'lock_subdir': yaml_config.get('lock_subdir', '.locks'),
        'max_backup_count': yaml_config.get('max_backup_count', 7),

        # logging.config.dictConfig 必需的配置
        'version': 1,
        'disable_existing_loggers': False,

        # 格式化器
        'formatters': {
            'simple_msg': {
                'format': '%(message)s'
            },
            'basic_format': {
                'format': '[%(asctime)s][%(filename)s][%(lineno)s][%(levelname)s][%(thread)d] - %(message)s'
            },
        },

        'handlers': {},
        'loggers': {},
    }

    # 构建 handlers
    yaml_handlers = yaml_config.get('handlers', {})
    for handler_name, handler_conf in yaml_handlers.items():
        config['handlers'][handler_name] = {
            'class': 'loggers.core.handlers.OrganizedFileHandler',
            'formatter': handler_conf.get('formatter', 'simple_msg'),
            'level': handler_conf.get('level', 'DEBUG'),
            'filename': handler_conf.get('filename'),
            'when': handler_conf.get('when', 'D'),
            'interval': handler_conf.get('interval', 1),
            'maxBytes': handler_conf.get('max_bytes', 200 * 1024 * 1024),
            'encoding': handler_conf.get('encoding', 'utf-8'),
            'use_gzip': handler_conf.get('use_gzip', False),
        }

    # 构建 loggers
    yaml_loggers = yaml_config.get('loggers', {})
    for logger_name, logger_conf in yaml_loggers.items():
        config['loggers'][logger_name] = {
            'handlers': logger_conf.get('handlers', []),
            'level': logger_conf.get('level', 'DEBUG'),
            'propagate': logger_conf.get('propagate', False),
        }

    return config


# 加载配置
_yaml_config = _load_yaml_config()
LOGGING_CONFIG = _build_logging_config(_yaml_config)
