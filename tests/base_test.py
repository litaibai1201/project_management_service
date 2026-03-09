# -*- coding: utf-8 -*-
"""
@文件: base_test.py
@說明: 測試用例
@時間: 2023/12/01 11:21:07
@作者: LiDong
"""


from unittest import TestCase

from app import create_app
from configs.app_config import SQLALCHEMY_DATABASE_TEST_URI
from dbs.mysql_db import db

app = create_app()


class BaseTest(TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["SQLALCHEMY_DATABASE_URI"] = SQLALCHEMY_DATABASE_TEST_URI
        app.config["DEBUG"] = False

    def setUp(self):
        TestCase.maxDiff = None
        with app.app_context():
            db.create_all()
        self.app = app.test_client
        self.app_context = app.app_context

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()
