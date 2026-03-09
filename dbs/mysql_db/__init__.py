# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@說明: model模塊
@時間: 2023/10/19 19:04:39
@作者: LiDong
"""

from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, fields
from sqlalchemy import Boolean, Integer

from common.common_tools import TryExcept

db = SQLAlchemy()


class DBFunction:

    @staticmethod
    @TryExcept(default_error="數據庫commit失敗")
    def db_commit():
        db.session.commit()
        return True

    @staticmethod
    def db_rollback():
        db.session.rollback()
        return False

    @classmethod
    def do_commit(cls, result, flag):
        if flag:
            result, flag = cls.db_commit()
            if flag:
                return result, flag
        cls.db_rollback()

        return result, flag


class CommonModelDbSchema(Schema):
    def __new__(cls, *args, **kwargs):
        attrs = {}
        model_class: type = cls.__dict__["__modelclass__"]
        if "__table__" in model_class.__dict__:
            tables = model_class.__dict__["__table__"]
            all_column_nm_list = []
            for column in tables.columns:
                column_name = column.name
                column_type = column.type
                if isinstance(column_type, Integer):
                    attrs[column_name] = fields.Int()
                elif isinstance(column_type, Boolean):
                    attrs[column_name] = fields.Bool()
                else:
                    attrs[column_name] = fields.Str()
                all_column_nm_list.append(column_name)
            for key, val in cls.__dict__.items():
                if "post_load" not in attrs and key == "post_load":
                    attrs[key] = val
                elif key in all_column_nm_list:
                    attrs[key] = val
        else:
            for key, val in model_class.__dict__.items():
                if "post_load" not in attrs and "post_load" in cls.__dict__:
                    attrs["post_load"] = cls.__dict__["post_load"]
                    continue
                elif not isinstance(val, db.Column):
                    continue
                if key in dir(cls):
                    attrs[key] = cls.__dict__[key]
                elif isinstance(val.type, Integer):
                    attrs[key] = fields.Int()
                elif isinstance(val.type, Boolean):
                    attrs[key] = fields.Bool()
                else:
                    attrs[key] = fields.Str()

        return type(cls.__name__, (Schema,), attrs)(*args, **kwargs)
