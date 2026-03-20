# -*- coding: utf-8 -*-
"""
@文件: test_crypto.py
@说明: Fernet 加密模块单元测试
@时间: 2026-03-09

运行: python -m pytest tests/test_crypto.py -v
"""
import os
import unittest


class TestCryptoConfig(unittest.TestCase):
    """CryptoConfig 类测试"""

    def setUp(self):
        # 每个测试前重置单例状态，确保使用新的 master key
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        # 生成测试用密钥并注入环境变量
        from cryptography.fernet import Fernet
        self._test_key = Fernet.generate_key().decode()
        os.environ["APP_MASTER_KEY"] = self._test_key

    def tearDown(self):
        os.environ.pop("APP_MASTER_KEY", None)
        # 重置单例
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None

    def _get_crypto(self):
        from crypto.fernet import CryptoConfig
        return CryptoConfig()

    # ==================== 基本功能 ====================

    def test_is_available_with_valid_key(self):
        crypto = self._get_crypto()
        self.assertTrue(crypto.is_available)

    def test_is_not_available_without_key(self):
        os.environ.pop("APP_MASTER_KEY", None)
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        crypto = CryptoConfig()
        self.assertFalse(crypto.is_available)

    def test_encrypt_returns_enc_prefix(self):
        crypto = self._get_crypto()
        result = crypto.encrypt("hello")
        self.assertTrue(result.startswith("ENC("))
        self.assertTrue(result.endswith(")"))

    def test_decrypt_returns_original(self):
        crypto = self._get_crypto()
        original = "my_secret_password"
        encrypted = crypto.encrypt(original)
        decrypted = crypto.decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_decrypt_without_enc_wrapper(self):
        """decrypt() 也接受不带 ENC() 包装的纯密文"""
        crypto = self._get_crypto()
        original = "plain_value"
        encrypted = crypto.encrypt(original)
        # 去掉 ENC( 和 )
        raw_cipher = encrypted[4:-1]
        decrypted = crypto.decrypt(raw_cipher)
        self.assertEqual(decrypted, original)

    def test_encrypt_different_calls_produce_different_ciphertext(self):
        """每次加密结果不同（Fernet 使用随机 IV）"""
        crypto = self._get_crypto()
        c1 = crypto.encrypt("same_text")
        c2 = crypto.encrypt("same_text")
        self.assertNotEqual(c1, c2)

    def test_decrypt_with_wrong_key_raises(self):
        crypto = self._get_crypto()
        encrypted = crypto.encrypt("secret")
        # 换一个不同的 key
        from cryptography.fernet import Fernet
        new_key = Fernet.generate_key().decode()
        os.environ["APP_MASTER_KEY"] = new_key
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        crypto2 = CryptoConfig()
        with self.assertRaises(ValueError):
            crypto2.decrypt(encrypted)

    def test_encrypt_without_key_raises(self):
        os.environ.pop("APP_MASTER_KEY", None)
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        crypto = CryptoConfig()
        with self.assertRaises(RuntimeError):
            crypto.encrypt("test")

    # ==================== is_encrypted ====================

    def test_is_encrypted_with_enc_format(self):
        crypto = self._get_crypto()
        self.assertTrue(crypto.is_encrypted("ENC(somedata)"))

    def test_is_encrypted_plain_text(self):
        crypto = self._get_crypto()
        self.assertFalse(crypto.is_encrypted("plain_password"))

    def test_is_encrypted_empty_string(self):
        crypto = self._get_crypto()
        self.assertFalse(crypto.is_encrypted(""))

    def test_is_encrypted_none(self):
        crypto = self._get_crypto()
        self.assertFalse(crypto.is_encrypted(None))

    def test_is_encrypted_partial_prefix(self):
        crypto = self._get_crypto()
        self.assertFalse(crypto.is_encrypted("ENC(missing_suffix"))

    # ==================== decrypt_if_encrypted ====================

    def test_decrypt_if_encrypted_decrypts_enc_value(self):
        crypto = self._get_crypto()
        original = "my_password"
        encrypted = crypto.encrypt(original)
        result = crypto.decrypt_if_encrypted(encrypted)
        self.assertEqual(result, original)

    def test_decrypt_if_encrypted_returns_plain_as_is(self):
        crypto = self._get_crypto()
        plain = "not_encrypted_value"
        result = crypto.decrypt_if_encrypted(plain)
        self.assertEqual(result, plain)

    def test_decrypt_if_encrypted_none_returns_none(self):
        crypto = self._get_crypto()
        result = crypto.decrypt_if_encrypted(None)
        self.assertIsNone(result)

    def test_decrypt_if_encrypted_no_key_raises(self):
        """有加密值但没有 master key 应该抛出 RuntimeError"""
        crypto = self._get_crypto()
        encrypted = crypto.encrypt("secret")
        # 重置为无 key 状态
        os.environ.pop("APP_MASTER_KEY", None)
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        crypto_no_key = CryptoConfig()
        with self.assertRaises(RuntimeError):
            crypto_no_key.decrypt_if_encrypted(encrypted)

    # ==================== generate_key ====================

    def test_generate_key_returns_string(self):
        from crypto.fernet import CryptoConfig
        key = CryptoConfig.generate_key()
        self.assertIsInstance(key, str)
        self.assertGreater(len(key), 0)

    def test_generate_key_is_valid_fernet_key(self):
        from crypto.fernet import CryptoConfig
        from cryptography.fernet import Fernet
        key = CryptoConfig.generate_key()
        # 能够创建 Fernet 实例说明是有效密钥
        f = Fernet(key.encode())
        encrypted = f.encrypt(b"test")
        decrypted = f.decrypt(encrypted)
        self.assertEqual(decrypted, b"test")

    def test_generate_key_different_each_call(self):
        from crypto.fernet import CryptoConfig
        k1 = CryptoConfig.generate_key()
        k2 = CryptoConfig.generate_key()
        self.assertNotEqual(k1, k2)

    # ==================== derive_key_from_password ====================

    def test_derive_key_from_password(self):
        from crypto.fernet import CryptoConfig
        key, salt = CryptoConfig.derive_key_from_password("my_password")
        self.assertIsInstance(key, str)
        self.assertIsInstance(salt, str)
        self.assertGreater(len(key), 0)
        self.assertGreater(len(salt), 0)

    def test_derive_key_deterministic_with_same_salt(self):
        import base64
        from crypto.fernet import CryptoConfig
        salt_bytes = os.urandom(16)
        key1, _ = CryptoConfig.derive_key_from_password("password", salt=salt_bytes)
        key2, _ = CryptoConfig.derive_key_from_password("password", salt=salt_bytes)
        self.assertEqual(key1, key2)

    def test_derive_key_different_for_different_passwords(self):
        import base64
        from crypto.fernet import CryptoConfig
        salt_bytes = os.urandom(16)
        key1, _ = CryptoConfig.derive_key_from_password("password1", salt=salt_bytes)
        key2, _ = CryptoConfig.derive_key_from_password("password2", salt=salt_bytes)
        self.assertNotEqual(key1, key2)


class TestConvenienceFunctions(unittest.TestCase):
    """便捷函数测试"""

    def setUp(self):
        from cryptography.fernet import Fernet
        self._test_key = Fernet.generate_key().decode()
        os.environ["APP_MASTER_KEY"] = self._test_key
        # 重置单例
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None
        # 重新初始化模块级 crypto 对象
        import crypto.fernet as m
        m.crypto = m.CryptoConfig()

    def tearDown(self):
        os.environ.pop("APP_MASTER_KEY", None)
        from crypto.fernet import CryptoConfig
        CryptoConfig._instance = None
        CryptoConfig._fernet = None

    def test_generate_key_function(self):
        from crypto.fernet import generate_key
        key = generate_key()
        self.assertIsInstance(key, str)

    def test_encrypt_value_function(self):
        from crypto.fernet import encrypt_value
        result = encrypt_value("test_password")
        self.assertTrue(result.startswith("ENC("))

    def test_decrypt_value_function(self):
        from crypto.fernet import encrypt_value, decrypt_value
        original = "my_secret"
        encrypted = encrypt_value(original)
        decrypted = decrypt_value(encrypted)
        self.assertEqual(decrypted, original)

    def test_decrypt_value_none(self):
        from crypto.fernet import decrypt_value
        self.assertIsNone(decrypt_value(None))

    def test_decrypt_env_function(self):
        from crypto.fernet import encrypt_value, decrypt_env
        original = "db_password_123"
        encrypted = encrypt_value(original)
        os.environ["TEST_SECRET_VAR"] = encrypted
        result = decrypt_env("TEST_SECRET_VAR")
        self.assertEqual(result, original)
        os.environ.pop("TEST_SECRET_VAR", None)

    def test_decrypt_env_plain_value(self):
        from crypto.fernet import decrypt_env
        os.environ["TEST_PLAIN_VAR"] = "plain_value"
        result = decrypt_env("TEST_PLAIN_VAR")
        self.assertEqual(result, "plain_value")
        os.environ.pop("TEST_PLAIN_VAR", None)

    def test_decrypt_env_default(self):
        from crypto.fernet import decrypt_env
        result = decrypt_env("NON_EXISTENT_VAR_XYZ", default="default_val")
        self.assertEqual(result, "default_val")


if __name__ == "__main__":
    unittest.main()
