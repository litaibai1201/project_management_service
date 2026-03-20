# -*- coding: utf-8 -*-
'''
@文件: model_serializes.py
@說明:
@時間: 2024/08/28 11:25:35
'''

from dbs.mysql_db import CommonModelDbSchema
from dbs.mysql_db.model_tables import TestModel
from marshmallow import post_load


class TestModelSchema(CommonModelDbSchema):

    __modelclass__ = TestModel

    @post_load
    def post_load(self, instance, **kwargs):
        return TestModel(**instance)
