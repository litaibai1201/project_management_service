# -*- coding: utf-8 -*-
"""会议备注控制器"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import MeetingNoteModel, UserProfileModel


class MeetingNoteController:

    def _name_map(self, work_nos: list) -> dict:
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            UserProfileModel.work_no.in_(work_nos)
        ).all()
        return {u.work_no: u.name for u in users}

    def list_by_project(self, project_id: str) -> list:
        """获取专案下所有会议备注（按创建时间倒序）"""
        notes = (
            db.session.query(MeetingNoteModel)
            .filter_by(project_id=project_id)
            .order_by(MeetingNoteModel.created_at.desc())
            .all()
        )
        author_nos = list({n.author for n in notes})
        name_map = self._name_map(author_nos)
        return [n.to_dict(author_name=name_map.get(n.author, n.author)) for n in notes]

    def create(self, project_id: str, payload: dict, author: str) -> dict:
        """新增一条备注"""
        note = MeetingNoteModel(
            project_id=project_id,
            task_id=payload.get("task_id") or None,
            task_name=payload.get("task_name") or None,
            note_type=payload.get("note_type", "行動項"),
            content=payload["content"],
            author=author,
        )
        db.session.add(note)
        db.session.commit()
        name_map = self._name_map([author])
        return note.to_dict(author_name=name_map.get(author, author))

    def update_status(self, note_id: str, status: str, operator: str) -> dict:
        """切换备注状态 pending ↔ resolved"""
        note = db.session.query(MeetingNoteModel).filter_by(id=note_id).first()
        if not note:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(resource_type="会议备注")
        note.status = status
        note.updated_at = CommonTools.get_now()
        db.session.commit()
        name_map = self._name_map([note.author])
        return note.to_dict(author_name=name_map.get(note.author, note.author))

    def delete(self, note_id: str, operator: str) -> None:
        """删除备注（仅作者可删）"""
        note = db.session.query(MeetingNoteModel).filter_by(id=note_id).first()
        if not note:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(resource_type="会议备注")
        from utils.exceptions import PermissionException
        if note.author != operator:
            raise PermissionException(msg="只有備注創建人才能刪除")
        db.session.delete(note)
        db.session.commit()
