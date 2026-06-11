# -*- coding: utf-8 -*-
"""
Tests for SystemDAO:
  query_active, find_active_by_id, list_groups, name_map
"""
import pytest
from tables.system_table import SystemModel
from tables.user_table import UserProfileModel
from daos.system_dao import SystemDAO
from dbs.mysql_db import db as _db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_system(sys_nm: str, sys_group: str = "GroupA",
                 sys_status: int = 1) -> SystemModel:
    return SystemModel(
        sys_nm=sys_nm,
        sys_group=sys_group,
        sys_status=sys_status,
    )


def _make_user(work_no: str, name: str) -> UserProfileModel:
    return UserProfileModel(
        work_no=work_no, name=name,
        department="IT", position="Dev",
        password="pw", status=1,
    )


# ---------------------------------------------------------------------------
# query_active
# ---------------------------------------------------------------------------

def test_query_active_excludes_deleted_systems(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("ActiveSys",  sys_status=1))
        _db.session.add(_make_system("DeletedSys", sys_status=9))
        _db.session.commit()

        results = dao.query_active().all()
        names = [r.sys_nm for r in results]
        assert "ActiveSys" in names
        assert "DeletedSys" not in names


def test_query_active_with_keyword_filter(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("PaymentService"))
        _db.session.add(_make_system("OrderService"))
        _db.session.commit()

        results = dao.query_active(keyword="Payment").all()
        assert len(results) == 1
        assert results[0].sys_nm == "PaymentService"


def test_query_active_with_group_filter(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("SysAlpha", sys_group="Backend"))
        _db.session.add(_make_system("SysBeta",  sys_group="Frontend"))
        _db.session.commit()

        results = dao.query_active(sys_group="Backend").all()
        assert len(results) == 1
        assert results[0].sys_nm == "SysAlpha"


def test_query_active_with_no_filters_returns_all_active(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("S1", sys_status=1))
        _db.session.add(_make_system("S2", sys_status=1))
        _db.session.add(_make_system("S3", sys_status=9))
        _db.session.commit()

        results = dao.query_active().all()
        assert len(results) == 2


def test_query_active_returns_results_ordered_by_name_asc(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("Zebra"))
        _db.session.add(_make_system("Alpha"))
        _db.session.add(_make_system("Mango"))
        _db.session.commit()

        results = dao.query_active().all()
        names = [r.sys_nm for r in results]
        assert names == sorted(names)


def test_query_active_keyword_and_group_combined(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("BackendAuth",  sys_group="Backend"))
        _db.session.add(_make_system("BackendOrder", sys_group="Backend"))
        _db.session.add(_make_system("FrontendAuth", sys_group="Frontend"))
        _db.session.commit()

        results = dao.query_active(keyword="Auth", sys_group="Backend").all()
        assert len(results) == 1
        assert results[0].sys_nm == "BackendAuth"


# ---------------------------------------------------------------------------
# find_active_by_id
# ---------------------------------------------------------------------------

def test_find_active_by_id_returns_active_system(app, db):
    dao = SystemDAO()
    with app.app_context():
        sys = _make_system("LiveSys", sys_status=1)
        _db.session.add(sys)
        _db.session.commit()

        result = dao.find_active_by_id(sys.id)
        assert result is not None
        assert result.id == sys.id


def test_find_active_by_id_returns_none_for_deleted_system(app, db):
    dao = SystemDAO()
    with app.app_context():
        sys = _make_system("DeadSys", sys_status=9)
        _db.session.add(sys)
        _db.session.commit()

        result = dao.find_active_by_id(sys.id)
        assert result is None


def test_find_active_by_id_returns_none_for_missing_id(app, db):
    dao = SystemDAO()
    with app.app_context():
        result = dao.find_active_by_id("no_such_id_000000000000000000000000")
        assert result is None


# ---------------------------------------------------------------------------
# list_groups
# ---------------------------------------------------------------------------

def test_list_groups_returns_distinct_group_names(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("SysA", sys_group="Backend"))
        _db.session.add(_make_system("SysB", sys_group="Backend"))
        _db.session.add(_make_system("SysC", sys_group="Frontend"))
        _db.session.commit()

        groups = dao.list_groups()
        assert isinstance(groups, list)
        assert "Backend" in groups
        assert "Frontend" in groups
        assert groups.count("Backend") == 1  # must be distinct


def test_list_groups_excludes_deleted_systems(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_system("DeletedGroupSys", sys_group="ObsoleteGroup", sys_status=9))
        _db.session.add(_make_system("ActiveGroupSys",  sys_group="ActiveGroup",   sys_status=1))
        _db.session.commit()

        groups = dao.list_groups()
        assert "ObsoleteGroup" not in groups
        assert "ActiveGroup" in groups


def test_list_groups_excludes_none_and_empty_groups(app, db):
    dao = SystemDAO()
    with app.app_context():
        sys_no_group = SystemModel(sys_nm="NoGroupSys", sys_group=None, sys_status=1)
        sys_empty_group = SystemModel(sys_nm="EmptyGroupSys", sys_group="", sys_status=1)
        _db.session.add(sys_no_group)
        _db.session.add(sys_empty_group)
        _db.session.commit()

        groups = dao.list_groups()
        assert None not in groups
        assert "" not in groups


def test_list_groups_returns_empty_list_when_no_active_systems(app, db):
    dao = SystemDAO()
    with app.app_context():
        groups = dao.list_groups()
        assert groups == []


# ---------------------------------------------------------------------------
# name_map
# ---------------------------------------------------------------------------

def test_name_map_returns_work_no_to_name_dict(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_user("sys_u01", "Alice"))
        _db.session.add(_make_user("sys_u02", "Bob"))
        _db.session.commit()

        result = dao.name_map({"sys_u01", "sys_u02"})
        assert isinstance(result, dict)
        assert result["sys_u01"] == "Alice"
        assert result["sys_u02"] == "Bob"


def test_name_map_keys_are_lowercase(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_user("SYS_U03", "Charlie"))
        _db.session.commit()

        result = dao.name_map({"SYS_U03"})
        assert "sys_u03" in result
        assert result["sys_u03"] == "Charlie"


def test_name_map_returns_empty_dict_for_empty_set(app, db):
    dao = SystemDAO()
    with app.app_context():
        result = dao.name_map(set())
        assert result == {}


def test_name_map_ignores_nonexistent_work_nos(app, db):
    dao = SystemDAO()
    with app.app_context():
        _db.session.add(_make_user("sys_u04", "Dave"))
        _db.session.commit()

        result = dao.name_map({"sys_u04", "ghost_user"})
        assert "sys_u04" in result
        assert "ghost_user" not in result
