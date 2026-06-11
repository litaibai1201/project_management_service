# -*- coding: utf-8 -*-
"""会议备注接口测试 — /api/project/<pid>/meeting_notes"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：创建一个专案 ────────────────────────────────────────────────────────

def create_project(client, token):
    resp = client.post("/api/project/create_project",
                       data={"project_nm": "备注测试专案", "project_type": "研发"},
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    return data.get("content", {}).get("project_id")


# ── 辅助：创建一条会议备注，返回 note_id ──────────────────────────────────────

def create_note(client, token, pid, overrides=None):
    payload = {"content": "测试会议备注内容", "note_type": "行動項"}
    if overrides:
        payload.update(overrides)
    resp = json_post(client, f"/api/project/{pid}/meeting_notes", payload, token=token)
    data = resp.get_json()
    return data.get("content", {}).get("id")


class TestMeetingNoteList:
    """列出专案会议备注"""

    def test_list_notes_empty(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_get(client, f"/api/project/{pid}/meeting_notes", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)
            assert len(data["content"]) == 0

    def test_list_notes_with_data(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            create_note(client, auth_token, pid)
            resp = json_get(client, f"/api/project/{pid}/meeting_notes", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]) >= 1

    def test_list_notes_requires_auth(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_get(client, f"/api/project/{pid}/meeting_notes")
            assert resp.status_code in (401, 422)


class TestMeetingNoteCreate:
    """新增会议备注"""

    def test_create_note_basic(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_post(client, f"/api/project/{pid}/meeting_notes",
                             {"content": "第一条行动项"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["id"] is not None
            assert data["content"]["content"] == "第一条行动项"

    def test_create_note_with_type(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_post(client, f"/api/project/{pid}/meeting_notes",
                             {"content": "决议事项", "note_type": "決議"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["type"] == "決議"

    def test_create_note_with_task_id(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_post(client, f"/api/project/{pid}/meeting_notes",
                             {"content": "任务相关备注", "task_id": "some-task-id",
                              "task_name": "任务名称"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_multiple_notes(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            create_note(client, auth_token, pid, {"content": "备注1"})
            create_note(client, auth_token, pid, {"content": "备注2"})
            resp = json_get(client, f"/api/project/{pid}/meeting_notes", token=auth_token)
            data = resp.get_json()
            assert len(data["content"]) == 2

    def test_create_note_requires_auth(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_post(client, f"/api/project/{pid}/meeting_notes",
                             {"content": "未授权备注"})
            assert resp.status_code in (401, 422)


class TestMeetingNoteStatusUpdate:
    """切换备注状态"""

    def test_update_status_to_resolved(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            assert nid is not None
            resp = json_put(client, f"/api/meeting_notes/{nid}/status",
                            {"status": "resolved"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["status"] == "resolved"

    def test_update_status_to_pending(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            # 先设为 resolved
            json_put(client, f"/api/meeting_notes/{nid}/status",
                     {"status": "resolved"}, token=auth_token)
            # 再切回 pending
            resp = json_put(client, f"/api/meeting_notes/{nid}/status",
                            {"status": "pending"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["status"] == "pending"

    def test_update_status_nonexistent_note(self, client, auth_token, app):
        with app.app_context():
            resp = json_put(client, "/api/meeting_notes/ghost-note-000/status",
                            {"status": "resolved"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_status_requires_auth(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            resp = json_put(client, f"/api/meeting_notes/{nid}/status",
                            {"status": "resolved"})
            assert resp.status_code in (401, 422)


class TestMeetingNoteDelete:
    """删除会议备注"""

    def test_delete_note_by_author(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            assert nid is not None
            resp = json_delete(client, f"/api/meeting_notes/{nid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_deleted_note_not_in_list(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            json_delete(client, f"/api/meeting_notes/{nid}", token=auth_token)
            resp = json_get(client, f"/api/project/{pid}/meeting_notes", token=auth_token)
            data = resp.get_json()
            ids = [n["id"] for n in data["content"]]
            assert nid not in ids

    def test_delete_nonexistent_note(self, client, auth_token, app):
        with app.app_context():
            resp = json_delete(client, "/api/meeting_notes/ghost-note-000",
                               token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_delete_note_by_non_author_fails(self, client, auth_token, seed_user, app, db):
        """非作者删除备注应被拒绝"""
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)

        # 创建第二个用户并登录
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            user2 = UserProfileModel(work_no="u999", name="其他用户",
                                     department="研发部", position="工程师",
                                     password="pass9999", status=1)
            db.session.add(user2)
            db.session.commit()
        from tests.conftest import json_post as _post
        resp2 = _post(client, "/api/user/login", {"work_no": "u999", "password": "pass9999"})
        token2 = resp2.get_json()["content"]["access_token"]

        with app.app_context():
            resp = json_delete(client, f"/api/meeting_notes/{nid}", token=token2)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_delete_requires_auth(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            nid = create_note(client, auth_token, pid)
            resp = json_delete(client, f"/api/meeting_notes/{nid}")
            assert resp.status_code in (401, 422)
