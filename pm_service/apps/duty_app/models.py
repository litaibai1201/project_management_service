# -*- coding: utf-8 -*-
"""
@文件: models.py
@說明:
@時間: 2024/03/06 16:01:34
@作者: LiDong
"""

from functools import cached_property

from sqlalchemy import and_, asc, desc, func, not_, or_

from common.common_tools import CommonTools, TryExcept
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (DutyApplyReviewerModel,
                                       DutyProgressReaderModel,
                                       DutyResponsibleModel,
                                       ReviewRecordModel,
                                       TemporaryDutyApplyRecordModel,
                                       TemporaryDutyModel,
                                       TemporaryDutyRecordDataModel)


class OperTemporaryDutyModel:

    @cached_property
    def session_data(self):
        return db.session.query(TemporaryDutyModel)

    def search_data_by_status(self, user_id, page, size, status):
        session_data = self.session_data.join(
            DutyResponsibleModel,
            DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
        ).filter(
            DutyResponsibleModel.work_no == user_id,
            TemporaryDutyModel.status == status,
        )
        data_list = session_data.slice((page - 1) * size, page * size).all()
        total_count = session_data.count()
        return data_list, total_count

    def search_data_by_nm_exclude_id(self, duty_nm, department, duty_id):
        data = self.session_data.filter(
            TemporaryDutyModel.duty_nm == duty_nm,
            TemporaryDutyModel.department == department,
            TemporaryDutyModel.status != 0,
            TemporaryDutyModel.id != duty_id,
        ).first()
        return data

    def check_if_exist(self, payload, user_id):
        data = self.session_data.filter(
            TemporaryDutyModel.duty_nm == payload["duty_nm"],
            TemporaryDutyModel.department == payload["department"],
            TemporaryDutyModel.creator == user_id,
            TemporaryDutyModel.status != 0,
            TemporaryDutyModel.status != 3,
        ).first()
        return data

    def search_data_by_duty_id(self, duty_id):
        data = self.session_data.filter(
            TemporaryDutyModel.id == duty_id,
            TemporaryDutyModel.status != 0,
        ).first()
        return data

    def search_pause_by_id(self, user_id, duty_id, status=[1, 2, 4]):
        responsible_subq = (
            db.session.query(DutyResponsibleModel.duty_id)
            .filter(DutyResponsibleModel.work_no == user_id)
            .subquery()
        )
        data = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.id == duty_id,
            or_(
                TemporaryDutyModel.creator == user_id,
                TemporaryDutyModel.id.in_(responsible_subq),
            ),
            TemporaryDutyModel.status.in_(status)
        ).first()
        return data

    @TryExcept("添加臨時任務失敗")
    def add_data_to_db(self, obj):
        db.session.add(obj)
        return True

    @TryExcept("更新臨時任務失敗")
    def update_data_by_id(self, duty_id, update_data):
        self.session_data.filter(
            TemporaryDutyModel.id == duty_id).update(update_data)
        return True

    @TryExcept("刪除臨時任務失敗")
    def delete_temporary_duty_by_id(self, duty_id):
        db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.id == duty_id, TemporaryDutyModel.status != 0
        ).update({"status": 0, "status_update_at": CommonTools.get_now()})
        return True

    def __format_empid_filter(self, empid_list):
        responsible_subq = (
            db.session.query(DutyResponsibleModel.duty_id)
            .filter(DutyResponsibleModel.work_no.in_(empid_list))
            .subquery()
        )
        filter_data = or_(
            or_(TemporaryDutyModel.creator == empid for empid in empid_list),
            TemporaryDutyModel.id.in_(responsible_subq),
        )
        return filter_data

    def __add_filter_data(self, session_data, **kwargs):
        # keyword, status, creator, responsible
        keyword = kwargs.get("keyword")
        if keyword:
            session_data = session_data.filter(
                TemporaryDutyModel.duty_nm.contains(keyword)
            )
        status = kwargs.get("status")
        if status is not None:
            session_data = session_data.filter(
                TemporaryDutyModel.status == status
            )
        else:
            session_data = session_data.filter(TemporaryDutyModel.status != 0)
        creator = kwargs.get("creator")
        if creator:
            session_data = session_data.filter(
                TemporaryDutyModel.creator == creator
            )
        responsible = kwargs.get("responsible")
        if responsible:
            responsible_subq = (
                db.session.query(DutyResponsibleModel.duty_id)
                .filter(DutyResponsibleModel.work_no == responsible)
                .subquery()
            )
            session_data = session_data.filter(
                TemporaryDutyModel.id.in_(responsible_subq)
            )
        return session_data

    def __column(self, column):
        return getattr(TemporaryDutyModel, column)

    def __create_order_filter(self, filter_data, column, sort_data):
        column = self.__column(column)
        if sort_data == 1:
            filter_data = filter_data.order_by(asc(column))
        elif sort_data == 2:
            filter_data = filter_data.order_by(desc(column))
        return filter_data

    def __format_order_filter(self, order_list, filter_data):
        # orderby: priority, expected_start_date, expected_end_date,
        # start_time, end_time, progress
        for data in order_list:
            key = data.get("key")
            value = data.get("value")
            if key:
                filter_data = self.__create_order_filter(
                    filter_data, key, value
                )
        return filter_data

    def __search_data_list(self, empid_list, **kwargs):
        # page, size, keyword, status, creator, responsible,
        # orderby: priority, expected_start_date, expected_end_date,
        # start_time, end_time, progress
        filter_data = self.__format_empid_filter(empid_list)
        session_data = self.session_data.filter(filter_data)
        session_data = self.__add_filter_data(session_data, **kwargs)
        order_list = kwargs.get("orderby", [])
        if order_list:
            session_data = self.__format_order_filter(order_list, session_data)
        else:
            session_data = session_data.order_by(
                desc(TemporaryDutyModel.expected_start_date),
                asc(TemporaryDutyModel.expected_end_date),
            )
        return session_data

    def search_data_list(self, empid_list, **kwargs):
        session_data = self.__search_data_list(empid_list, **kwargs)
        page = kwargs.get("page", 1)
        size = kwargs.get("size", 10)
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    def search_by_empid(self, empid, page, size):
        session_data = (
            db.session.query(
                TemporaryDutyModel.id,
                TemporaryDutyModel.duty_nm,
                func.count(TemporaryDutyModel.id).label("total_record_num"),
            )
            .join(
                TemporaryDutyRecordDataModel,
                TemporaryDutyRecordDataModel.duty_id == TemporaryDutyModel.id,
            )
            .outerjoin(
                DutyProgressReaderModel,
                and_(
                    DutyProgressReaderModel.progress_id == TemporaryDutyRecordDataModel.id,
                    DutyProgressReaderModel.work_no == empid,
                ),
            )
            .join(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                TemporaryDutyModel.status != 0,
                DutyProgressReaderModel.id.is_(None),  # 未读: 关联表无记录
                or_(
                    TemporaryDutyModel.creator == empid,
                    DutyResponsibleModel.work_no == empid,
                ),
            )
            .group_by(TemporaryDutyModel.id, TemporaryDutyModel.duty_nm)
        )
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    @TryExcept("數據更新失敗")
    def update_status(self, status, review_id):
        db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyApplyRecordModel.duty_id == TemporaryDutyModel.id,
            TemporaryDutyApplyRecordModel.id == review_id,
        ).update({"status": status, "status_update_at": CommonTools.get_now()})


class OperTemporaryDutyRecordModel:

    @TryExcept("添加進度記錄失敗")
    def add_data_to_db(self, obj):
        db.session.add(obj)
        return True

    def __search_data(self, session_data, empid, unread):
        if unread == 1:
            read_subq = (
                db.session.query(DutyProgressReaderModel.progress_id)
                .filter(DutyProgressReaderModel.work_no == empid)
                .subquery()
            )
            session_data = session_data.filter(
                ~TemporaryDutyRecordDataModel.id.in_(read_subq)
            )
        session_data = session_data.order_by(
            TemporaryDutyRecordDataModel.id.desc())
        return session_data

    def search_data_by_duty_id(self, duty_id, empid, page, size, unread):
        session_data = db.session.query(TemporaryDutyRecordDataModel).filter(
            TemporaryDutyRecordDataModel.duty_id == duty_id
        )
        session_data = self.__search_data(session_data, empid, unread)
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    @TryExcept("已讀人員更新失敗")
    def update_data_to_db(self, data, progress_id):
        db.session.query(TemporaryDutyRecordDataModel).filter(
            TemporaryDutyRecordDataModel.id == progress_id
        ).update(data)


class OperTemporaryDutyApplyRecordModel:

    @TryExcept("添加任務申請失敗")
    def add_data_to_db(self, obj):
        return db.session.add(obj)

    def search_data_by_user_id(self, empid, page, size):
        apply_id_list = (
            db.session.query(ReviewRecordModel.apply_id)
            .filter(ReviewRecordModel.reviewer == empid)
            .all()
        )
        apply_id_list = [i[0] for i in apply_id_list if i]
        session_data = (
            db.session.query(
                TemporaryDutyApplyRecordModel,
                TemporaryDutyModel.duty_nm,
            )
            .join(
                TemporaryDutyModel,
                TemporaryDutyModel.id == TemporaryDutyApplyRecordModel.duty_id,
            )
            .join(
                DutyApplyReviewerModel,
                DutyApplyReviewerModel.apply_id == TemporaryDutyApplyRecordModel.id,
            )
            .filter(
                TemporaryDutyApplyRecordModel.status == 1,
                ~TemporaryDutyApplyRecordModel.id.in_(apply_id_list),
                DutyApplyReviewerModel.work_no == empid,
            )
        )
        datalist = session_data.slice((page - 1) * size, page * size).all()
        total_count = session_data.count()
        return datalist, total_count

    def search_data_by_review_id(self, review_id):
        data = (
            db.session.query(TemporaryDutyApplyRecordModel)
            .filter(TemporaryDutyApplyRecordModel.id == review_id)
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_status(self, status, review_id):
        update_data = {"status": status, "updated_at": CommonTools.get_now()}
        db.session.query(TemporaryDutyApplyRecordModel).filter(
            TemporaryDutyApplyRecordModel.id == review_id
        ).update(update_data)


class OperReviewRecordFormModel:

    def search_result_by_review_id(self, review_id):
        datalist = (
            db.session.query(ReviewRecordModel)
            .filter(ReviewRecordModel.apply_id == review_id)
            .all()
        )
        return datalist

    @TryExcept("專案審批結果插入失敗")
    def add_data_to_db(self, obj):
        db.session.add(obj)
