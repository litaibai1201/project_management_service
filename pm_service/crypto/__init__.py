# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: 配置加密模块 - 用于 .env 敏感配置加密
@时间: 2025-09-03

使用方法:
    1. 生成主密钥: python -m crypto.cli generate-key -o .master.key
    2. 加密配置值: python -m crypto.cli encrypt "your_password"
    3. 在 .env 中使用: MYSQL_PASSWORD=ENC(gAAAAABn...)
    4. 应用启动时自动解密

代码中使用:
    from crypto import decrypt_env
    password = decrypt_env("MYSQL_PASSWORD")
"""

from .fernet import (
    CryptoConfig,
    crypto,
    encrypt_value,
    decrypt_value,
    decrypt_env,
    generate_key,
)

__all__ = [
    "CryptoConfig",
    "crypto",
    "encrypt_value",
    "decrypt_value",
    "decrypt_env",
    "generate_key",
]
