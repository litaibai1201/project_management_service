# -*- coding: utf-8 -*-
"""
Tests for ProjectDAO:
  find_project_by_id, find_active_project, find_function_by_id, name_map
"""
import pytest
from tables.project_table import ProjectDataModel
from tables.function_table import FunctionDataModel
from tables.user_table import UserProfileModel
from daos.project_dao import ProjectDAO
from dbs.mysql_db import db as _db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_project(project_nm: str = "Test Project",
                  project_pm: str = "pm001",
                  project_status: int = 3) -> ProjectDataModel:
    return ProjectDataModel(
        project_nm=project_nm,
        project_pm=project_pm,
        project_status=project_status,
        priority=2,
    )


def _make_function(project_id: str, function_nm: str = "Feature A",
                   function_status: int = 1) -> FunctionDataModel:
    return FunctionDataModel(
        function_nm=function_nm,
        project_id=project_id,
        function_status=function_status,
        priority=2,
    )


def _make_user(work_no: str, name: str) -> UserProfileModel:
    return UserProfileModel(
        work_no=work_no, name=name,
        department="Dev", position="Engineer",
        password="pw", status=1,
    )


# ---------------------------------------------------------------------------
# find_project_by_id
# ---------------------------------------------------------------------------

def test_find_project_by_id_returns_correct_project(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project("Alpha Project")
        _db.session.add(proj)
        _db.session.commit()

        result = dao.find_project_by_id(proj.id)
        assert result is not None
        assert result.id == proj.id
        assert result.project_nm == "Alpha Project"


def test_find_project_by_id_returns_deleted_project(app, db):
    """find_project_by_id should return even deleted (status=9) projects."""
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project("DeletedProj", project_status=9)
        _db.session.add(proj)
        _db.session.commit()

        result = dao.find_project_by_id(proj.id)
        assert result is not None
        assert result.project_status == 9


def test_find_project_by_id_returns_none_for_missing_id(app, db):
    dao = ProjectDAO()
    with app.app_context():
        result = dao.find_project_by_id("no_such_project_00000000000000000")
        assert result is None


def test_find_project_by_id_returns_project_data_model_instance(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.commit()

        result = dao.find_project_by_id(proj.id)
        assert isinstance(result, ProjectDataModel)


# ---------------------------------------------------------------------------
# find_active_project
# ---------------------------------------------------------------------------

def test_find_active_project_returns_non_deleted_project(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project("ActiveProj", project_status=5)
        _db.session.add(proj)
        _db.session.commit()

        result = dao.find_active_project(proj.id)
        assert result is not None
        assert result.id == proj.id


def test_find_active_project_returns_none_for_deleted_project(app, db):
    """project_status=9 means deleted — find_active_project must return None."""
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project("GoneProj", project_status=9)
        _db.session.add(proj)
        _db.session.commit()

        result = dao.find_active_project(proj.id)
        assert result is None


def test_find_active_project_returns_none_for_missing_id(app, db):
    dao = ProjectDAO()
    with app.app_context():
        result = dao.find_active_project("missing_id_000000000000000000000000")
        assert result is None


def test_find_active_project_allows_all_non_deleted_statuses(app, db):
    dao = ProjectDAO()
    with app.app_context():
        for status in [1, 2, 3, 4, 5, 7, 8, 10, 11]:
            proj = _make_project(f"Proj_status_{status}", project_status=status)
            _db.session.add(proj)
        _db.session.commit()

        projects = _db.session.query(ProjectDataModel).all()
        for proj in projects:
            result = dao.find_active_project(proj.id)
            assert result is not None, f"Expected active project for status={proj.project_status}"


# ---------------------------------------------------------------------------
# find_function_by_id
# ---------------------------------------------------------------------------

def test_find_function_by_id_returns_correct_function(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.flush()

        func = _make_function(proj.id, "Login Feature")
        _db.session.add(func)
        _db.session.commit()

        result = dao.find_function_by_id(func.id)
        assert result is not None
        assert result.id == func.id
        assert result.function_nm == "Login Feature"


def test_find_function_by_id_returns_deleted_function(app, db):
    """find_function_by_id returns functions regardless of status."""
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.flush()

        func = _make_function(proj.id, "DeletedFunc", function_status=9)
        _db.session.add(func)
        _db.session.commit()

        result = dao.find_function_by_id(func.id)
        assert result is not None
        assert result.function_status == 9


def test_find_function_by_id_returns_none_for_missing_id(app, db):
    dao = ProjectDAO()
    with app.app_context():
        result = dao.find_function_by_id("nonexistent_func_0000000000000000")
        assert result is None


def test_find_function_by_id_returns_function_data_model_instance(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.flush()

        func = _make_function(proj.id)
        _db.session.add(func)
        _db.session.commit()

        result = dao.find_function_by_id(func.id)
        assert isinstance(result, FunctionDataModel)


# ---------------------------------------------------------------------------
# find_active_function
# ---------------------------------------------------------------------------

def test_find_active_function_returns_non_deleted_function(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.flush()

        func = _make_function(proj.id, function_status=2)
        _db.session.add(func)
        _db.session.commit()

        result = dao.find_active_function(func.id)
        assert result is not None


def test_find_active_function_returns_none_for_deleted_function(app, db):
    dao = ProjectDAO()
    with app.app_context():
        proj = _make_project()
        _db.session.add(proj)
        _db.session.flush()

        func = _make_function(proj.id, function_status=9)
        _db.session.add(func)
        _db.session.commit()

        result = dao.find_active_function(func.id)
        assert result is None


# ---------------------------------------------------------------------------
# name_map
# ---------------------------------------------------------------------------

def test_name_map_returns_work_no_to_name_dict(app, db):
    dao = ProjectDAO()
    with app.app_context():
        _db.session.add(_make_user("prj_u01", "Alice"))
        _db.session.add(_make_user("prj_u02", "Bob"))
        _db.session.commit()

        result = dao.name_map(["prj_u01", "prj_u02"])
        assert isinstance(result, dict)
        assert result["prj_u01"] == "Alice"
        assert result["prj_u02"] == "Bob"


def test_name_map_keys_are_lowercase(app, db):
    dao = ProjectDAO()
    with app.app_context():
        _db.session.add(_make_user("PRJ_U03", "Charlie"))
        _db.session.commit()

        result = dao.name_map(["PRJ_U03"])
        assert "prj_u03" in result
        assert result["prj_u03"] == "Charlie"


def test_name_map_is_case_insensitive_on_input(app, db):
    dao = ProjectDAO()
    with app.app_context():
        _db.session.add(_make_user("prj_u04", "Dave"))
        _db.session.commit()

        result = dao.name_map(["PRJ_U04"])
        assert result.get("prj_u04") == "Dave"


def test_name_map_returns_empty_dict_for_empty_input(app, db):
    dao = ProjectDAO()
    with app.app_context():
        result = dao.name_map([])
        assert result == {}


def test_name_map_ignores_nonexistent_work_nos(app, db):
    dao = ProjectDAO()
    with app.app_context():
        _db.session.add(_make_user("prj_u05", "Eve"))
        _db.session.commit()

        result = dao.name_map(["prj_u05", "nobody_xyz"])
        assert "prj_u05" in result
        assert "nobody_xyz" not in result


def test_name_map_accepts_set_input(app, db):
    dao = ProjectDAO()
    with app.app_context():
        _db.session.add(_make_user("prj_u06", "Frank"))
        _db.session.commit()

        result = dao.name_map({"prj_u06"})
        assert result.get("prj_u06") == "Frank"
