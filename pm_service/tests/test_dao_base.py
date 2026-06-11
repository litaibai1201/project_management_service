# -*- coding: utf-8 -*-
"""
Tests for BaseDAO — get_by_id, add, delete, commit, paginate
Uses UserProfileModel as the concrete model under test.
"""
import pytest
from tables.user_table import UserProfileModel
from daos.base_dao import BaseDAO
from dbs.mysql_db import db as _db


class UserDAO(BaseDAO):
    """Minimal concrete DAO for testing BaseDAO methods."""
    model = UserProfileModel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(work_no: str, name: str = "Test User") -> UserProfileModel:
    return UserProfileModel(
        work_no=work_no,
        name=name,
        department="Engineering",
        position="Engineer",
        password="hashed_pw",
        status=1,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_add_and_commit_persists_record(app, db):
    dao = UserDAO()
    with app.app_context():
        user = _make_user("u001", "Alice")
        dao.add(user)
        dao.commit()

        fetched = _db.session.query(UserProfileModel).filter_by(work_no="u001").first()
        assert fetched is not None
        assert fetched.name == "Alice"


def test_get_by_id_returns_correct_record(app, db):
    dao = UserDAO()
    with app.app_context():
        user = _make_user("u002", "Bob")
        dao.add(user)
        dao.commit()

        result = dao.get_by_id(user.id)
        assert result is not None
        assert result.work_no == "u002"
        assert result.name == "Bob"


def test_get_by_id_returns_none_for_missing_id(app, db):
    dao = UserDAO()
    with app.app_context():
        result = dao.get_by_id("nonexistent_id_00000000000000000000")
        assert result is None


def test_delete_removes_record(app, db):
    dao = UserDAO()
    with app.app_context():
        user = _make_user("u003", "Charlie")
        dao.add(user)
        dao.commit()

        record_id = user.id
        fetched = dao.get_by_id(record_id)
        assert fetched is not None

        dao.delete(fetched)
        dao.commit()

        after_delete = dao.get_by_id(record_id)
        assert after_delete is None


def test_paginate_returns_correct_page_and_total(app, db):
    dao = UserDAO()
    with app.app_context():
        for i in range(5):
            dao.add(_make_user(f"page{i:02d}", f"User{i}"))
        dao.commit()

        q = _db.session.query(UserProfileModel)
        items, total = dao.paginate(q, page=1, size=3)

        assert total == 5
        assert len(items) == 3


def test_paginate_second_page_returns_remaining(app, db):
    dao = UserDAO()
    with app.app_context():
        for i in range(5):
            dao.add(_make_user(f"pg2_{i:02d}", f"User{i}"))
        dao.commit()

        q = _db.session.query(UserProfileModel)
        items, total = dao.paginate(q, page=2, size=3)

        assert total == 5
        assert len(items) == 2


def test_paginate_empty_table_returns_zero_total(app, db):
    dao = UserDAO()
    with app.app_context():
        q = _db.session.query(UserProfileModel)
        items, total = dao.paginate(q, page=1, size=20)

        assert total == 0
        assert items == []


def test_list_all_with_filter_returns_matching_records(app, db):
    dao = UserDAO()
    with app.app_context():
        dao.add(_make_user("la001", "FilterMe"))
        dao.add(_make_user("la002", "SkipMe"))
        dao.commit()

        results = dao.list_all(work_no="la001")
        assert len(results) == 1
        assert results[0].name == "FilterMe"


def test_list_all_no_filter_returns_all_records(app, db):
    dao = UserDAO()
    with app.app_context():
        dao.add(_make_user("all001", "All1"))
        dao.add(_make_user("all002", "All2"))
        dao.commit()

        results = dao.list_all()
        assert len(results) == 2


def test_flush_makes_record_queryable_before_commit(app, db):
    dao = UserDAO()
    with app.app_context():
        user = _make_user("flush01", "FlushUser")
        dao.add(user)
        dao.flush()

        # After flush the record has an id and is visible in the session
        assert user.id is not None

        fetched = _db.session.query(UserProfileModel).filter_by(work_no="flush01").first()
        assert fetched is not None
        dao.commit()
