#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
@文件: cli.py
@说明: 配置加密命令行工具
@时间: 2025-09-03

使用方法:
    python -m crypto.cli generate-key -o .master.key   # 生成主密钥
    python -m crypto.cli encrypt "your_password"       # 加密配置值
    python -m crypto.cli decrypt "ENC(gAAAAABn...)"    # 解密配置值
    python -m crypto.cli encrypt-env .env              # 批量加密 .env 文件
    python -m crypto.cli decrypt-env .env              # 查看解密后的配置
"""
import argparse
import os
import sys
import re
from typing import List

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)


def get_crypto():
    """延迟导入 crypto 模块"""
    from crypto.fernet import CryptoConfig
    return CryptoConfig()


def cmd_generate_key(args):
    """生成主密钥"""
    from crypto.fernet import generate_key

    key = generate_key()

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(key)
        if os.name != "nt":
            os.chmod(args.output, 0o600)
        print(f"主密钥已保存到: {args.output}")
        print(f"文件权限已设置为 600")
    else:
        print("生成的主密钥:")
        print(key)
        print()
        print("保存方式:")
        print("  python -m crypto.cli generate-key -o .master.key")


def cmd_encrypt(args):
    """加密配置值"""
    if args.key_file:
        os.environ["APP_MASTER_KEY_FILE"] = args.key_file

    crypto = get_crypto()

    if not crypto.is_available:
        print("错误: 主密钥未配置")
        print("请先生成: python -m crypto.cli generate-key -o .master.key")
        sys.exit(1)

    encrypted = crypto.encrypt(args.value)
    print("加密结果:")
    print(encrypted)


def cmd_decrypt(args):
    """解密配置值"""
    if args.key_file:
        os.environ["APP_MASTER_KEY_FILE"] = args.key_file

    crypto = get_crypto()

    if not crypto.is_available:
        print("错误: 主密钥未配置")
        sys.exit(1)

    try:
        decrypted = crypto.decrypt(args.value)
        print("解密结果:")
        print(decrypted)
    except ValueError as e:
        print(f"错误: {e}")
        sys.exit(1)


def cmd_encrypt_env(args):
    """批量加密 .env 文件中的敏感字段"""
    if args.key_file:
        os.environ["APP_MASTER_KEY_FILE"] = args.key_file

    crypto = get_crypto()

    if not crypto.is_available:
        print("错误: 主密钥未配置")
        sys.exit(1)

    if not os.path.exists(args.env_file):
        print(f"错误: 文件不存在 {args.env_file}")
        sys.exit(1)

    # 要加密的字段
    fields_to_encrypt: List[str] = []
    if args.fields:
        fields_to_encrypt = [f.strip() for f in args.fields.split(",")]
    else:
        fields_to_encrypt = [
            "MYSQL_PASSWORD",
            "REDIS_PASSWORD",
            "JWT_SECRET_KEY",
            "SECRET_KEY",
            "S3_PASSWORD",
            "MINIO_PASSWORD",
            "FTP_PASSWORD",
            "ORACLE_PASSWORD",
        ]

    with open(args.env_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines = []
    encrypted_count = 0

    for line in lines:
        if line.strip().startswith("#") or "=" not in line:
            new_lines.append(line)
            continue

        match = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line.strip(), re.IGNORECASE)
        if not match:
            new_lines.append(line)
            continue

        key, value = match.groups()

        if key in fields_to_encrypt:
            value = value.strip().strip('"').strip("'")

            if crypto.is_encrypted(value) or not value:
                new_lines.append(line)
                continue

            encrypted_value = crypto.encrypt(value)
            new_lines.append(f"{key}={encrypted_value}\n")
            encrypted_count += 1
            print(f"已加密: {key}")
        else:
            new_lines.append(line)

    output_file = args.output or args.env_file
    if args.dry_run:
        print("\n--- 预览模式 ---")
        print("".join(new_lines))
    else:
        with open(output_file, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"\n已加密 {encrypted_count} 个字段 -> {output_file}")


def cmd_decrypt_env(args):
    """解密 .env 文件中的加密字段"""
    if args.key_file:
        os.environ["APP_MASTER_KEY_FILE"] = args.key_file

    crypto = get_crypto()

    if not crypto.is_available:
        print("错误: 主密钥未配置")
        sys.exit(1)

    if not os.path.exists(args.env_file):
        print(f"错误: 文件不存在 {args.env_file}")
        sys.exit(1)

    with open(args.env_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    print("解密后的配置:")
    print("-" * 40)

    for line in lines:
        if line.strip().startswith("#") or "=" not in line:
            continue

        match = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line.strip(), re.IGNORECASE)
        if not match:
            continue

        key, value = match.groups()
        value = value.strip().strip('"').strip("'")

        if crypto.is_encrypted(value):
            try:
                decrypted = crypto.decrypt(value)
                # 部分隐藏
                if len(decrypted) > 4:
                    masked = decrypted[:2] + "*" * (len(decrypted) - 4) + decrypted[-2:]
                else:
                    masked = "*" * len(decrypted)
                print(f"{key}={masked}")
            except ValueError as e:
                print(f"{key}=<解密失败>")


def main():
    parser = argparse.ArgumentParser(
        description="配置加密命令行工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python -m crypto.cli generate-key -o .master.key
  python -m crypto.cli encrypt "my_password"
  python -m crypto.cli encrypt-env .env
  python -m crypto.cli decrypt-env .env
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # generate-key
    gen_parser = subparsers.add_parser("generate-key", help="生成主密钥")
    gen_parser.add_argument("-o", "--output", help="输出文件路径")

    # encrypt
    enc_parser = subparsers.add_parser("encrypt", help="加密配置值")
    enc_parser.add_argument("value", help="要加密的明文")
    enc_parser.add_argument("-k", "--key-file", help="密钥文件路径")

    # decrypt
    dec_parser = subparsers.add_parser("decrypt", help="解密配置值")
    dec_parser.add_argument("value", help="要解密的密文")
    dec_parser.add_argument("-k", "--key-file", help="密钥文件路径")

    # encrypt-env
    enc_env_parser = subparsers.add_parser("encrypt-env", help="批量加密 .env")
    enc_env_parser.add_argument("env_file", help=".env 文件路径")
    enc_env_parser.add_argument("-f", "--fields", help="要加密的字段 (逗号分隔)")
    enc_env_parser.add_argument("-o", "--output", help="输出文件路径")
    enc_env_parser.add_argument("-k", "--key-file", help="密钥文件路径")
    enc_env_parser.add_argument("--dry-run", action="store_true", help="预览模式")

    # decrypt-env
    dec_env_parser = subparsers.add_parser("decrypt-env", help="查看解密后的 .env")
    dec_env_parser.add_argument("env_file", help=".env 文件路径")
    dec_env_parser.add_argument("-k", "--key-file", help="密钥文件路径")

    args = parser.parse_args()

    commands = {
        "generate-key": cmd_generate_key,
        "encrypt": cmd_encrypt,
        "decrypt": cmd_decrypt,
        "encrypt-env": cmd_encrypt_env,
        "decrypt-env": cmd_decrypt_env,
    }

    if args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
