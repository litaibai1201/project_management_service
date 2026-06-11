# -*- coding: utf-8 -*-
"""
Tests for MeetingNoteDAO:
  list_by_project, find_by_id, name_map
"""
import pytest
from tables.meeting_note_table import MeetingNoteModel
from tables.user_table import UserProfileModel
from daos.meeting_note_dao import MeetingNoteDAO
from dbs.mysql_db import db as _db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_note(project_id: str, author: str = "u001",
               content: str = "Meeting content",
               note_type: str = "decision") -> MeetingNoteModel:
    return MeetingNoteModel(
        project_id=project_id,
        note_type=note_type,
        content=content,
        author=author,
        status="pending",
    )


def _make_user(work_no: str, name: str) -> UserProfileModel:
    return UserProfileModel(
        work_no=work_no, name=name,
        department="Dept", position="Eng",
        password="pw", status=1,
    )


# ---------------------------------------------------------------------------
# list_by_project
# ---------------------------------------------------------------------------

def test_list_by_project_returns_all_notes_for_project(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_note("proj_alpha", content="Note A"))
        _db.session.add(_make_note("proj_alpha", content="Note B"))
        _db.session.add(_make_note("proj_beta",  content="Note C"))  # different project
        _db.session.commit()

        results = dao.list_by_project("proj_alpha")
        assert len(results) == 2
        assert all(r.project_id == "proj_alpha" for r in results)


def test_list_by_project_returns_empty_for_unknown_project(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        results = dao.list_by_project("no_such_project")
        assert results == []


def test_list_by_project_returns_list_type(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_note("proj_gamma"))
        _db.session.commit()

        results = dao.list_by_project("proj_gamma")
        assert isinstance(results, list)
        assert isinstance(results[0], MeetingNoteModel)


def test_list_by_project_ordered_by_created_at_desc(app, db):
    """Notes must be returned newest-first (DESC created_at)."""
    dao = MeetingNoteDAO()
    with app.app_context():
        note_early = MeetingNoteModel(
            project_id="proj_order", note_type="risk",
            content="Early note", author="u001", status="pending",
            created_at="2024-01-01 09:00:00",
        )
        note_late = MeetingNoteModel(
            project_id="proj_order", note_type="risk",
            content="Late note", author="u001", status="pending",
            created_at="2024-06-01 09:00:00",
        )
        _db.session.add(note_early)
        _db.session.add(note_late)
        _db.session.commit()

        results = dao.list_by_project("proj_order")
        assert results[0].content == "Late note"
        assert results[1].content == "Early note"


# ---------------------------------------------------------------------------
# find_by_id
# ---------------------------------------------------------------------------

def test_find_by_id_returns_correct_note(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        note = _make_note("proj_find")
        _db.session.add(note)
        _db.session.commit()

        result = dao.find_by_id(note.id)
        assert result is not None
        assert result.id == note.id
        assert result.project_id == "proj_find"


def test_find_by_id_returns_none_for_missing_id(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        result = dao.find_by_id("nonexistent_note_id_0000000000000000")
        assert result is None


def test_find_by_id_returns_meeting_note_model_instance(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        note = _make_note("proj_type_check")
        _db.session.add(note)
        _db.session.commit()

        result = dao.find_by_id(note.id)
        assert isinstance(result, MeetingNoteModel)


# ---------------------------------------------------------------------------
# name_map
# ---------------------------------------------------------------------------

def test_name_map_returns_work_no_to_name_dict(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_user("nm001", "Alice"))
        _db.session.add(_make_user("nm002", "Bob"))
        _db.session.commit()

        result = dao.name_map(["nm001", "nm002"])
        assert isinstance(result, dict)
        assert result["nm001"] == "Alice"
        assert result["nm002"] == "Bob"


def test_name_map_keys_are_lowercase(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_user("NM003", "Charlie"))
        _db.session.commit()

        result = dao.name_map(["NM003"])
        assert "nm003" in result
        assert result["nm003"] == "Charlie"


def test_name_map_is_case_insensitive_lookup(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_user("nm004", "Dave"))
        _db.session.commit()

        result = dao.name_map(["NM004"])
        assert result.get("nm004") == "Dave"


def test_name_map_returns_empty_dict_for_empty_list(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        result = dao.name_map([])
        assert result == {}


def test_name_map_ignores_unknown_work_nos(app, db):
    dao = MeetingNoteDAO()
    with app.app_context():
        _db.session.add(_make_user("nm005", "Eve"))
        _db.session.commit()

        result = dao.name_map(["nm005", "nm_does_not_exist"])
        assert "nm005" in result
        assert "nm_does_not_exist" not in result
