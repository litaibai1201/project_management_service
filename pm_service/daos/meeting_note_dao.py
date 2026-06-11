# -*- coding: utf-8 -*-
"""
@文件: meeting_note_dao.py
@说明: 会议备注 DAO
"""
from dbs.mysql_db import db
from tables.meeting_note_table import MeetingNoteModel
from tables.user_table import UserProfileModel
from .base_dao import BaseDAO


class MeetingNoteDAO(BaseDAO):
    model = MeetingNoteModel

    def list_by_project(self, project_id: str):
        return (db.session.query(MeetingNoteModel)
                .filter_by(project_id=project_id)
                .order_by(MeetingNoteModel.created_at.desc())
                .all())

    def find_by_id(self, note_id: str):
        return db.session.query(MeetingNoteModel).filter_by(id=note_id).first()

    def name_map(self, work_nos: list) -> dict:
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u.name for u in users}
