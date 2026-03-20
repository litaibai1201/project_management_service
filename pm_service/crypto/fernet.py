# -*- coding: utf-8 -*-
"""
@文件: fernet.py
@说明: Fernet 对称加密 - 用于配置文件敏感信息加密
@时间: 2025-09-03

使用方法:
    1. 生成主密钥: python -m crypto.cli generate-key
    2. 加密配置值: python -m crypto.cli encrypt "your_password"
    3. 在 .env 中使用加密值: MYSQL_PASSWORD=ENC(gAAAAABn...)
    4. 应用启动时自动解密
"""
import os
import base64
from typing import Optional, Union

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class CryptoConfig:
    """Fernet 加密配置管理器

    用于加密/解密配置文件中的敏感信息（密码、密钥等）

    主密钥来源优先级:
        1. 环境变量 APP_MASTER_KEY
        2. 密钥文件 (路径由 APP_MASTER_KEY_FILE 指定)
        3. 默认密钥文件 .master.key
    """

    # 加密值前缀标识
    ENCRYPTED_PREFIX = "ENC("
    ENCRYPTED_SUFFIX = ")"

    # 环境变量名
    ENV_MASTER_KEY = "APP_MASTER_KEY"
    ENV_MASTER_KEY_FILE = "APP_MASTER_KEY_FILE"
    DEFAULT_KEY_FILE = ".master.key"

    _instance: Optional["CryptoConfig"] = None
    _fernet: Optional[Fernet] = None

    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._fernet is None:
            self._init_fernet()

    def _init_fernet(self):
        """初始化 Fernet 加密器"""
        master_key = self._load_master_key()
        if master_key:
            try:
                self._fernet = Fernet(master_key)
            except Exception:
                self._fernet = None

    def _load_master_key(self) -> Optional[bytes]:
        """加载主密钥"""
        # 1. 从环境变量读取
        key_from_env = os.environ.get(self.ENV_MASTER_KEY)
        if key_from_env:
            return key_from_env.encode()

        # 2. 从密钥文件读取
        key_file = os.environ.get(self.ENV_MASTER_KEY_FILE, self.DEFAULT_KEY_FILE)

        # 支持相对路径和绝对路径
        if not os.path.isabs(key_file):
            # 相对于项目根目录
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            key_file = os.path.join(project_root, key_file)

        if os.path.exists(key_file):
            with open(key_file, "r", encoding="utf-8") as f:
                return f.read().strip().encode()

        return None

    @property
    def is_available(self) -> bool:
        """检查加密功能是否可用"""
        return self._fernet is not None

    def encrypt(self, plaintext: str) -> str:
        """加密明文

        Args:
            plaintext: 明文字符串

        Returns:
            加密后的密文 (带 ENC() 前缀)

        Raises:
            RuntimeError: 主密钥未配置
        """
        if not self._fernet:
            raise RuntimeError("主密钥未配置，无法加密")

        encrypted = self._fernet.encrypt(plaintext.encode())
        return f"{self.ENCRYPTED_PREFIX}{encrypted.decode()}{self.ENCRYPTED_SUFFIX}"

    def decrypt(self, ciphertext: str) -> str:
        """解密密文

        Args:
            ciphertext: 密文字符串 (带或不带 ENC() 前缀)

        Returns:
            解密后的明文

        Raises:
            RuntimeError: 主密钥未配置
            ValueError: 密文无效或密钥不匹配
        """
        if not self._fernet:
            raise RuntimeError("主密钥未配置，无法解密")

        # 去除 ENC() 前缀和后缀
        if ciphertext.startswith(self.ENCRYPTED_PREFIX) and ciphertext.endswith(
            self.ENCRYPTED_SUFFIX
        ):
            ciphertext = ciphertext[len(self.ENCRYPTED_PREFIX) : -len(self.ENCRYPTED_SUFFIX)]

        try:
            decrypted = self._fernet.decrypt(ciphertext.encode())
            return decrypted.decode()
        except InvalidToken:
            raise ValueError("解密失败: 密文无效或主密钥不匹配")

    def is_encrypted(self, value: str) -> bool:
        """检查值是否为加密格式"""
        if not value or not isinstance(value, str):
            return False
        return value.startswith(self.ENCRYPTED_PREFIX) and value.endswith(
            self.ENCRYPTED_SUFFIX
        )

    def decrypt_if_encrypted(self, value: str) -> str:
        """如果是加密值则解密，否则原样返回

        Args:
            value: 配置值

        Returns:
            解密后的值或原值
        """
        if not value or not isinstance(value, str):
            return value

        if self.is_encrypted(value):
            if not self.is_available:
                raise RuntimeError(
                    f"检测到加密配置，但主密钥未配置。"
                    f"请设置环境变量 {self.ENV_MASTER_KEY} 或创建密钥文件 {self.DEFAULT_KEY_FILE}"
                )
            return self.decrypt(value)

        return value

    @staticmethod
    def generate_key() -> str:
        """生成新的主密钥

        Returns:
            Base64 编码的密钥字符串
        """
        return Fernet.generate_key().decode()

    @staticmethod
    def derive_key_from_password(password: str, salt: Optional[bytes] = None) -> tuple:
        """从密码派生密钥

        用于需要记忆密码而非随机密钥的场景

        Args:
            password: 用户密码
            salt: 盐值 (可选，不提供则自动生成)

        Returns:
            (密钥, 盐值) 元组
        """
        if salt is None:
            salt = os.urandom(16)

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=480000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key.decode(), base64.b64encode(salt).decode()


# 全局单例
crypto = CryptoConfig()


# ==================== 便捷函数 ====================

def generate_key() -> str:
    """生成新的主密钥"""
    return CryptoConfig.generate_key()


def encrypt_value(plaintext: str) -> str:
    """加密值

    Args:
        plaintext: 明文

    Returns:
        加密后的密文 (带 ENC() 前缀)
    """
    return crypto.encrypt(plaintext)


def decrypt_value(value: Union[str, None]) -> Union[str, None]:
    """解密值 (如果是加密格式)

    Args:
        value: 配置值

    Returns:
        解密后的值或原值
    """
    if value is None:
        return None
    return crypto.decrypt_if_encrypted(value)


def decrypt_env(key: str, default: str = "") -> str:
    """从环境变量获取值，自动解密

    用法:
        password = decrypt_env("MYSQL_PASSWORD")

    Args:
        key: 环境变量名
        default: 默认值

    Returns:
        解密后的值
    """
    value = os.environ.get(key, default)
    return crypto.decrypt_if_encrypted(value)
