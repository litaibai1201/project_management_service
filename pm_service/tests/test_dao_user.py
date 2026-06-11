# -*- coding: utf-8 -*-
"""
Tests for UserDAO:
  find_by_work_no, name_map, is_supervisor, find_subordinate_rels
"""
import pytest
from tables.user_table import UserProfileModel, HierarchyModel
from daos.user_dao import UserDAO
from dbs.mysql_db import db as _db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(work_no: str, name: str = "Test", status: int = 1) -> UserProfileModel:
    return UserProfileModel(
        work_no=work_no, name=name,
        department="Engineering", position="Engineer",
        password="hashed_pw", status=status,
    )


def _make_hierarchy(supervisor: str, subordinate: str) -> HierarchyModel:
    return HierarchyModel(
        supervisor_work_no=supervisor,
        subordinate_work_no=subordinate,
    )


# ---------------------------------------------------------------------------
# find_by_work_no
# ---------------------------------------------------------------------------

def test_find_by_work_no_returns_active_user(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("fwn001", "Alice"))
        _db.session.commit()

        result = dao.find_by_work_no("fwn001")
        assert result is not None
        assert result.work_no == "fwn001"
        assert result.name == "Alice"


def test_find_by_work_no_is_case_insensitive(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("FWN002", "Bob"))
        _db.session.commit()

        result_lower = dao.find_by_work_no("fwn002")
        result_upper = dao.find_by_work_no("FWN002")
        result_mixed = dao.find_by_work_no("Fwn002")

        assert result_lower is not None
        assert result_upper is not None
        assert result_mixed is not None


def test_find_by_work_no_returns_none_for_inactive_user_when_active_only(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("fwn003", "Charlie", status=0))
        _db.session.commit()

        result = dao.find_by_work_no("fwn003", active_only=True)
        assert result is None


def test_find_by_work_no_returns_inactive_user_when_active_only_false(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("fwn004", "Dave", status=0))
        _db.session.commit()

        result = dao.find_by_work_no("fwn004", active_only=False)
        assert result is not None
        assert result.work_no == "fwn004"


def test_find_by_work_no_returns_none_for_unknown_work_no(app, db):
    dao = UserDAO()
    with app.app_context():
        result = dao.find_by_work_no("does_not_exist_999")
        assert result is None


def test_find_by_work_no_empty_string_returns_none(app, db):
    dao = UserDAO()
    with app.app_context():
        result = dao.find_by_work_no("")
        assert result is None


# ---------------------------------------------------------------------------
# name_map
# ---------------------------------------------------------------------------

def test_name_map_returns_correct_mapping(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("nm_u01", "Alice"))
        _db.session.add(_make_user("nm_u02", "Bob"))
        _db.session.commit()

        result = dao.name_map({"nm_u01", "nm_u02"})
        assert isinstance(result, dict)
        assert result["nm_u01"] == "Alice"
        assert result["nm_u02"] == "Bob"


def test_name_map_keys_are_lowercase(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("NM_U03", "Charlie"))
        _db.session.commit()

        result = dao.name_map({"NM_U03"})
        assert "nm_u03" in result
        assert result["nm_u03"] == "Charlie"


def test_name_map_is_case_insensitive_lookup(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("nm_u04", "Dave"))
        _db.session.commit()

        result = dao.name_map({"NM_U04"})
        assert result.get("nm_u04") == "Dave"


def test_name_map_returns_empty_dict_for_empty_set(app, db):
    dao = UserDAO()
    with app.app_context():
        result = dao.name_map(set())
        assert result == {}


def test_name_map_ignores_nonexistent_work_nos(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("nm_u05", "Eve"))
        _db.session.commit()

        result = dao.name_map({"nm_u05", "ghost_0000"})
        assert "nm_u05" in result
        assert "ghost_0000" not in result


def test_name_map_returns_dict_type(app, db):
    dao = UserDAO()
    with app.app_context():
        result = dao.name_map({"any_user"})
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# is_supervisor
# ---------------------------------------------------------------------------

def test_is_supervisor_returns_true_when_has_subordinate(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("sup001"))
        _db.session.add(_make_user("sub001"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("sup001", "sub001"))
        _db.session.commit()

        assert dao.is_supervisor("sup001") is True


def test_is_supervisor_returns_false_when_no_subordinate(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("solo001"))
        _db.session.commit()

        assert dao.is_supervisor("solo001") is False


def test_is_supervisor_returns_false_for_unknown_work_no(app, db):
    dao = UserDAO()
    with app.app_context():
        assert dao.is_supervisor("ghost_sup_99") is False


def test_is_supervisor_is_case_insensitive(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("SUP002"))
        _db.session.add(_make_user("SUB002"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("SUP002", "SUB002"))
        _db.session.commit()

        assert dao.is_supervisor("sup002") is True
        assert dao.is_supervisor("SUP002") is True


# ---------------------------------------------------------------------------
# find_subordinate_rels
# ---------------------------------------------------------------------------

def test_find_subordinate_rels_returns_all_subordinates(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("boss001"))
        _db.session.add(_make_user("emp001"))
        _db.session.add(_make_user("emp002"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("boss001", "emp001"))
        _db.session.add(_make_hierarchy("boss001", "emp002"))
        _db.session.commit()

        rels = dao.find_subordinate_rels("boss001")
        assert len(rels) == 2
        subordinates = {r.subordinate_work_no for r in rels}
        assert "emp001" in subordinates
        assert "emp002" in subordinates


def test_find_subordinate_rels_returns_empty_for_non_supervisor(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("leaf001"))
        _db.session.commit()

        rels = dao.find_subordinate_rels("leaf001")
        assert rels == []


def test_find_subordinate_rels_is_case_insensitive(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("BOSS002"))
        _db.session.add(_make_user("EMP003"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("BOSS002", "EMP003"))
        _db.session.commit()

        rels = dao.find_subordinate_rels("boss002")
        assert len(rels) == 1
        assert rels[0].subordinate_work_no == "EMP003"


def test_find_subordinate_rels_does_not_include_other_supervisors(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("mgr_a"))
        _db.session.add(_make_user("mgr_b"))
        _db.session.add(_make_user("emp_x"))
        _db.session.add(_make_user("emp_y"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("mgr_a", "emp_x"))
        _db.session.add(_make_hierarchy("mgr_b", "emp_y"))
        _db.session.commit()

        rels_a = dao.find_subordinate_rels("mgr_a")
        assert len(rels_a) == 1
        assert rels_a[0].subordinate_work_no == "emp_x"


def test_find_subordinate_rels_returns_hierarchy_model_instances(app, db):
    dao = UserDAO()
    with app.app_context():
        _db.session.add(_make_user("chk_sup"))
        _db.session.add(_make_user("chk_sub"))
        _db.session.flush()
        _db.session.add(_make_hierarchy("chk_sup", "chk_sub"))
        _db.session.commit()

        rels = dao.find_subordinate_rels("chk_sup")
        assert all(isinstance(r, HierarchyModel) for r in rels)
