# -*- coding: utf-8 -*-
"""
Tests for NotificationDAO:
  query_by_recipient, count_unread, find_by_id_and_recipient,
  mark_all_read, batch_insert
"""
import pytest
from tables.notification_table import NotificationModel
from daos.notification_dao import NotificationDAO
from dbs.mysql_db import db as _db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_notif(recipient: str, title: str = "Test Notification",
                is_read: bool = False, link_type: str = "project",
                link_id: str = "proj001") -> NotificationModel:
    return NotificationModel(
        recipient=recipient,
        title=title,
        desc="Some description",
        link_type=link_type,
        link_id=link_id,
        is_read=is_read,
    )


# ---------------------------------------------------------------------------
# query_by_recipient
# ---------------------------------------------------------------------------

def test_query_by_recipient_returns_ordered_results(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("worker01", title="First"))
        _db.session.add(_make_notif("worker01", title="Second"))
        _db.session.add(_make_notif("other_user", title="NotMine"))
        _db.session.commit()

        results = dao.query_by_recipient("worker01").all()

        assert len(results) == 2
        assert all(r.recipient == "worker01" for r in results)


def test_query_by_recipient_is_case_insensitive(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("Worker02", title="CaseTest"))
        _db.session.commit()

        results_lower = dao.query_by_recipient("worker02").all()
        results_upper = dao.query_by_recipient("WORKER02").all()

        assert len(results_lower) == 1
        assert len(results_upper) == 1


def test_query_by_recipient_empty_work_no_returns_empty(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("worker03"))
        _db.session.commit()

        results = dao.query_by_recipient("").all()
        assert results == []


def test_query_by_recipient_excludes_other_users(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("userA", title="ForA"))
        _db.session.add(_make_notif("userB", title="ForB"))
        _db.session.commit()

        results = dao.query_by_recipient("userA").all()
        assert all(r.recipient == "userA" for r in results)


# ---------------------------------------------------------------------------
# count_unread
# ---------------------------------------------------------------------------

def test_count_unread_returns_correct_count(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("cnt01", is_read=False))
        _db.session.add(_make_notif("cnt01", is_read=False))
        _db.session.add(_make_notif("cnt01", is_read=True))
        _db.session.commit()

        count = dao.count_unread("cnt01")
        assert count == 2


def test_count_unread_returns_zero_when_all_read(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("cnt02", is_read=True))
        _db.session.add(_make_notif("cnt02", is_read=True))
        _db.session.commit()

        count = dao.count_unread("cnt02")
        assert count == 0


def test_count_unread_returns_zero_for_unknown_user(app, db):
    dao = NotificationDAO()
    with app.app_context():
        count = dao.count_unread("nobody")
        assert count == 0


def test_count_unread_is_case_insensitive(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("Cnt03", is_read=False))
        _db.session.commit()

        assert dao.count_unread("cnt03") == 1
        assert dao.count_unread("CNT03") == 1


# ---------------------------------------------------------------------------
# find_by_id_and_recipient
# ---------------------------------------------------------------------------

def test_find_by_id_and_recipient_returns_record(app, db):
    dao = NotificationDAO()
    with app.app_context():
        notif = _make_notif("finder01")
        _db.session.add(notif)
        _db.session.commit()

        result = dao.find_by_id_and_recipient(notif.id, "finder01")
        assert result is not None
        assert result.id == notif.id


def test_find_by_id_and_recipient_returns_none_for_wrong_recipient(app, db):
    dao = NotificationDAO()
    with app.app_context():
        notif = _make_notif("owner01")
        _db.session.add(notif)
        _db.session.commit()

        result = dao.find_by_id_and_recipient(notif.id, "intruder99")
        assert result is None


def test_find_by_id_and_recipient_returns_none_for_missing_id(app, db):
    dao = NotificationDAO()
    with app.app_context():
        result = dao.find_by_id_and_recipient("nonexistent_id_000000000000000000", "anyone")
        assert result is None


def test_find_by_id_and_recipient_is_case_insensitive_on_work_no(app, db):
    dao = NotificationDAO()
    with app.app_context():
        notif = _make_notif("CaseUser01")
        _db.session.add(notif)
        _db.session.commit()

        result = dao.find_by_id_and_recipient(notif.id, "caseuser01")
        assert result is not None


# ---------------------------------------------------------------------------
# mark_all_read
# ---------------------------------------------------------------------------

def test_mark_all_read_marks_unread_notifications(app, db):
    dao = NotificationDAO()
    with app.app_context():
        for _ in range(3):
            _db.session.add(_make_notif("mark01", is_read=False))
        _db.session.commit()

        dao.mark_all_read("mark01")

        remaining_unread = dao.count_unread("mark01")
        assert remaining_unread == 0


def test_mark_all_read_does_not_affect_other_users(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("markA", is_read=False))
        _db.session.add(_make_notif("markB", is_read=False))
        _db.session.commit()

        dao.mark_all_read("markA")

        assert dao.count_unread("markA") == 0
        assert dao.count_unread("markB") == 1


def test_mark_all_read_is_idempotent(app, db):
    dao = NotificationDAO()
    with app.app_context():
        _db.session.add(_make_notif("idemp01", is_read=True))
        _db.session.commit()

        dao.mark_all_read("idemp01")  # should not raise
        assert dao.count_unread("idemp01") == 0


# ---------------------------------------------------------------------------
# batch_insert
# ---------------------------------------------------------------------------

def test_batch_insert_creates_one_record_per_recipient(app, db):
    dao = NotificationDAO()
    with app.app_context():
        recipients = ["bi001", "bi002", "bi003"]
        dao.batch_insert(recipients, "Batch Title", "Batch desc", "project", "proj_x")

        for wn in recipients:
            count = _db.session.query(NotificationModel).filter_by(recipient=wn).count()
            assert count == 1


def test_batch_insert_sets_correct_title_and_link(app, db):
    dao = NotificationDAO()
    with app.app_context():
        dao.batch_insert(["bichk01"], "My Title", "My desc", "review", "rev_abc")

        notif = _db.session.query(NotificationModel).filter_by(recipient="bichk01").first()
        assert notif is not None
        assert notif.title == "My Title"
        assert notif.link_type == "review"
        assert notif.link_id == "rev_abc"
        assert notif.is_read is False


def test_batch_insert_with_empty_recipients_inserts_nothing(app, db):
    dao = NotificationDAO()
    with app.app_context():
        dao.batch_insert([], "No One", "desc", "project", "proj_y")
        total = _db.session.query(NotificationModel).count()
        assert total == 0


def test_batch_insert_with_none_link_id_defaults_to_empty_string(app, db):
    dao = NotificationDAO()
    with app.app_context():
        dao.batch_insert(["nilid01"], "Title", "desc", "project", None)

        notif = _db.session.query(NotificationModel).filter_by(recipient="nilid01").first()
        assert notif is not None
        assert notif.link_id == ""
