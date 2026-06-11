# -*- coding: utf-8 -*-
"""
@文件: base_dao.py
@说明: DAO 基类，封装通用 CRUD 操作
"""
from dbs.mysql_db import db


class BaseDAO:
    """通用 DAO 基类"""
    model = None  # 子类必须指定

    def get_by_id(self, record_id: str):
        return db.session.query(self.model).filter_by(id=record_id).first()

    def list_all(self, **filters):
        q = db.session.query(self.model)
        for k, v in filters.items():
            q = q.filter(getattr(self.model, k) == v)
        return q.all()

    def add(self, instance):
        db.session.add(instance)

    def delete(self, instance):
        db.session.delete(instance)

    def commit(self):
        db.session.commit()

    def flush(self):
        db.session.flush()

    def paginate(self, query, page: int = 1, size: int = 20):
        total = query.count()
        items = query.offset((page - 1) * size).limit(size).all()
        return items, total
