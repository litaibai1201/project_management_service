# -*- coding: utf-8 -*-
"""
@文件: api_docs.py
@说明: API 文档工具（可选）
@时间: 2026/02/04

说明：
  API 文档自动由 flask-smorest 在 Swagger UI 中生成
  无需在此维护元数据
  
  这个文件保留用于将来可能的扩展功能，比如：
  - 导出 API 文档为文件
  - 生成自定义的 API 文档格式
  - 集成第三方工具
"""

def print_api_info() -> None:
    """打印蓝图信息"""
    from urls.routes import BLUEPRINTS
    
    print("\n" + "=" * 80)
    print("已注册的蓝图")
    print("=" * 80)
    
    for blp, config in BLUEPRINTS:
        url_prefix = config.get("url_prefix", "")
        print(f"\n✓ {blp.name}")
        print(f"  URL 前缀: {url_prefix if url_prefix else '(无前缀)'}")
    
    print("\n" + "=" * 80)
    print("API 文档链接: http://localhost:19999/api-docs")
    print("=" * 80 + "\n")

