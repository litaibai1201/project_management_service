# -*- coding: utf-8 -*-
"""
@文件: test_serialize.py
@说明: 测试接口的请求/响应序列化
@时间: 2023/12/01 13:36:58
"""

from marshmallow import Schema, fields, validate


class TestSchema(Schema):
    """测试数据请求 Schema"""
    work_no = fields.String(required=True, metadata={"description": "工号"})
    username = fields.String(metadata={"description": "用户名"})
    password = fields.String(metadata={"description": "密码"})


class TestQuerySchema(Schema):
    """测试数据查询参数 Schema"""
    work_no = fields.String(metadata={"description": "工号（可选）"})
    page = fields.Integer(load_default=1, metadata={"description": "页码"})
    page_size = fields.Integer(load_default=20, metadata={"description": "每页条数"})


class LoginSchema(Schema):
    """登录请求 Schema"""
    username = fields.String(required=True, metadata={"description": "用户名"})
    password = fields.String(required=True, metadata={"description": "密码"})


class FileUploadSchema(Schema):
    """文件上传请求 Schema"""
    bucket_name = fields.String(required=True, metadata={"description": "存储桶名称"})
    file_path = fields.String(required=True, metadata={"description": "文件路径"})
