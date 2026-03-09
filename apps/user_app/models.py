# -*- coding: utf-8 -*-
"""
@文件: models.py
@說明:
@時間: 2024/03/06 16:01:34
@作者: LiDong
"""


import traceback

from flask import current_app as app
from sqlalchemy import func, or_

from common.common_tools import TryExcept, get_now
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (FunctionDataModel, OperRecordModel,
                                       ProgressRecordDataModel,
                                       ProjectApplyRecordModel,
                                       ProjectDataModel, ProjectGroupModel,
                                       ReviewRecordModel,
                                       TemporaryDutyApplyRecordModel,
                                       TemporaryDutyModel,
                                       TemporaryDutyRecordDataModel)


class OperModel:
    def db_commit(self):
        try:
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            app.logger.error(traceback.format_exc())
            return False

    def db_rollback(self):
        db.session.rollback()
        return False


class OperTempDutyModel:
    def query_dev_tasks_by_emp(self, empid):
        data = (
            db.session.query(TemporaryDutyModel.status)
            .filter(
                TemporaryDutyModel.responsible.contains(empid),
                TemporaryDutyModel.progress < 100,
                TemporaryDutyModel.status.in_([1, 2]),
            )
            .all()
        )
        return data

    def query_task_num_by_emp_n_status(self, empid, status):
        data = (
            db.session.query(TemporaryDutyModel.id)
            .filter(
                or_(
                    TemporaryDutyModel.responsible.contains(empid),
                    TemporaryDutyModel.creator.contains(empid),
                ),
                TemporaryDutyModel.status == status,
            )
            .count()
        )
        return data

    def search_duty_nm_by_did(self, did):
        data = (
            db.session.query(TemporaryDutyModel.duty_nm)
            .filter(TemporaryDutyModel.id == did)
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_data_by_duty_id(self, duty_id):
        db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.id == duty_id
        ).update({"status": 0, "updated_at": get_now()})
        db.session.commit()
        return True


class OperFunctionDataModel:
    def query_dev_tasks_by_emp(self, empid):
        data = (
            db.session.query(FunctionDataModel.status)
            .join(ProjectDataModel, ProjectDataModel.id == FunctionDataModel.project_id)
            .filter(
                ProjectDataModel.status == 5,
                FunctionDataModel.developers.contains(empid),
                FunctionDataModel.progress < 100,
                FunctionDataModel.status.in_([1, 2]),
            )
            .all()
        )
        return data

    def __extrct_column_values(self, data):
        values = [item for (item,) in data]
        return values

    def query_dev_pid_by_emp(self, empid):
        data = (
            db.session.query(FunctionDataModel.project_id)
            .filter(
                FunctionDataModel.developers.contains(empid),
                FunctionDataModel.status != 0,
            )
            .all()
        )
        ids = self.__extrct_column_values(data)
        return ids

    def query_progress_n_status_by_pid(self, pid):
        data = (
            db.session.query(FunctionDataModel.progress, FunctionDataModel.status)
            .filter(FunctionDataModel.project_id == pid)
            .all()
        )
        return data

    def search_nm_by_fid_list(self, fid_list):
        data = (
            db.session.query(FunctionDataModel.id, FunctionDataModel.function_nm)
            .filter(FunctionDataModel.id.in_(fid_list))
            .all()
        )
        return data

    def update_fun_status(self, function_id, status):
        update_dict = {"status": status, "updated_at": get_now()}
        db.session.query(FunctionDataModel).filter(
            FunctionDataModel.id == function_id
        ).update(update_dict)
        db.session.commit()
        return True


class OperTwoTableModel:
    def query_formal_unread_record(self, empid):
        data = (
            db.session.query(ProjectDataModel.id)
            .join(
                FunctionDataModel, 
                FunctionDataModel.project_id == ProjectDataModel.id
            )
            .join(
                ProgressRecordDataModel,
                ProgressRecordDataModel.function_id == FunctionDataModel.id,
            )
            .filter(
                ProjectDataModel.status != 0,
                FunctionDataModel.status != 0,
                ~ProgressRecordDataModel.reader.contains(empid),
                or_(
                    ProjectDataModel.product_pm == empid,
                    ProjectDataModel.project_pm == empid,
                    ProjectDataModel.creator == empid,
                    FunctionDataModel.developers.contains(empid),
                ),
            )
            .count()
        )
        return data

    def query_temp_unread_record(self, empid):
        data = (
            db.session.query(TemporaryDutyRecordDataModel.id)
            .join(
                TemporaryDutyModel,
                TemporaryDutyModel.id == TemporaryDutyRecordDataModel.duty_id,
            )
            .filter(
                TemporaryDutyModel.responsible.contains(empid),
                or_(
                    ~TemporaryDutyRecordDataModel.reader.contains(empid),
                    TemporaryDutyRecordDataModel.reader.is_(None),
                ),
            )
            .all()
        )
        return data


class OperProjectApplyRecordModel:
    def __extract_ids_n_count(self, tuple_ids):
        ids = [item for (item, count) in tuple_ids]
        count = tuple_ids[0][1]
        return ids, count

    def query_need_review_task(self, empid):
        apply_id_list = (
            db.session.query(ReviewRecordModel.apply_id)
            .filter(ReviewRecordModel.reviewer == empid)
            .all()
        )
        apply_id_list = [i[0] for i in apply_id_list if i]
        subquery = (
            db.session.query(ProjectApplyRecordModel.id)
            .filter(
                ProjectApplyRecordModel.reviewer.contains(empid),
                ProjectApplyRecordModel.status == 1,
                ~ProjectApplyRecordModel.id.in_(apply_id_list),
            )
            .subquery()
        )
        data = db.session.query(subquery, func.count().over()).all()
        ids, count = [], 0
        if data:
            ids, count = self.__extract_ids_n_count(data)
        return ids, count

    def search_pro_apply_by_user_id(self, user_id, status, page, size):
        query = (
            db.session.query(
                ProjectApplyRecordModel.id,
                ProjectApplyRecordModel.function_id,
                ProjectApplyRecordModel.apply_type,
                ProjectApplyRecordModel.reviewer,
                ProjectApplyRecordModel.created_at,
                ProjectDataModel.project_nm,
                ProjectDataModel.id,
                ProjectApplyRecordModel.status,
            )
            .join(
                ProjectDataModel,
                ProjectDataModel.id == ProjectApplyRecordModel.project_id,
            )
            .filter(ProjectApplyRecordModel.submitter == user_id)
        )
        if status:
            query = query.filter(ProjectApplyRecordModel.status == status)
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total

    def search_apply_data_by_apply_id_status(self, apply_id):
        data = (
            db.session.query(ProjectApplyRecordModel)
            .filter(
                ProjectApplyRecordModel.id == apply_id,
                ProjectApplyRecordModel.status == 1,
            )
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_data_by_id(self, apply_id, update_dict):
        db.session.query(ProjectApplyRecordModel).filter(
            ProjectApplyRecordModel.id == apply_id
        ).update(update_dict)
        db.session.commit()
        return True


class OperTemporaryDutyApplyRecordModel:
    def __extract_ids_n_count(self, tuple_ids):
        ids = [item for (item, count) in tuple_ids]
        count = tuple_ids[0][1]
        return ids, count

    def query_need_review_task(self, empid):
        apply_id_list = (
            db.session.query(ReviewRecordModel.apply_id)
            .filter(ReviewRecordModel.reviewer == empid)
            .all()
        )
        apply_id_list = [i[0] for i in apply_id_list if i]
        subquery = (
            db.session.query(TemporaryDutyApplyRecordModel.id)
            .filter(
                TemporaryDutyApplyRecordModel.reviewer.contains(empid),
                TemporaryDutyApplyRecordModel.status == 1,
                ~TemporaryDutyApplyRecordModel.id.in_(apply_id_list),
            )
            .subquery()
        )
        data = db.session.query(subquery, func.count().over()).all()
        ids, count = [], 0
        if data:
            ids, count = self.__extract_ids_n_count(data)
        return ids, count

    def search_duty_apply_by_user_id(self, user_id, status, page, size):
        query = (
            db.session.query(
                TemporaryDutyApplyRecordModel,
                TemporaryDutyModel.duty_nm,
                TemporaryDutyModel.id,
            )
            .join(
                TemporaryDutyModel,
                TemporaryDutyModel.id == TemporaryDutyApplyRecordModel.duty_id,
            )
            .filter(TemporaryDutyApplyRecordModel.submitter == user_id)
        )
        if status:
            query = query.filter(TemporaryDutyApplyRecordModel.status == status)
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total

    def search_apply_data_by_apply_id(self, apply_id):
        data = (
            db.session.query(TemporaryDutyApplyRecordModel)
            .filter(TemporaryDutyApplyRecordModel.id == apply_id)
            .first()
        )
        return data

    def search_apply_data_by_apply_id_status(self, apply_id):
        data = (
            db.session.query(TemporaryDutyApplyRecordModel)
            .filter(
                TemporaryDutyApplyRecordModel.id == apply_id,
                TemporaryDutyApplyRecordModel.status == 1,
            )
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_data_by_id(self, apply_id, update_dict):
        db.session.query(TemporaryDutyApplyRecordModel).filter(
            TemporaryDutyApplyRecordModel.id == apply_id
        ).update(update_dict)
        db.session.commit()
        return True


class OperReviewRecordModel:
    def query_reviewed_record(self, apply_ids, empid):
        data_count = (
            db.session.query(func.count(ReviewRecordModel.id))
            .filter(
                ReviewRecordModel.apply_id.in_(apply_ids),
                ReviewRecordModel.reviewer == empid,
            )
            .scalar()
        )
        return data_count

    def search_review_by_idlist(self, aid_list):
        data = (
            db.session.query(
                ReviewRecordModel.apply_id,
                ReviewRecordModel.reviewer,
                ReviewRecordModel.result,
                ReviewRecordModel.remark,
                ReviewRecordModel.created_at,
            ).filter(ReviewRecordModel.apply_id.in_(aid_list))
            .all()
        )
        return data

    def search_first_review_by_id(self, id):
        data = (
            db.session.query(ReviewRecordModel)
            .filter(ReviewRecordModel.apply_id == id)
            .first()
        )
        return data

    def search_pro_review_apply_by_userid(self, user_id, page, size):
        query = (
            db.session.query(
                ReviewRecordModel, ProjectApplyRecordModel, ProjectDataModel.project_nm
            )
            .join(
                ProjectApplyRecordModel,
                ProjectApplyRecordModel.id == ReviewRecordModel.apply_id,
            )
            .join(
                ProjectDataModel,
                ProjectDataModel.id == ProjectApplyRecordModel.project_id,
            )
            .filter(ReviewRecordModel.reviewer == user_id)
        )
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total

    def search_duty_review_apply_by_userid(self, user_id, page, size):
        query = (
            db.session.query(
                ReviewRecordModel,
                TemporaryDutyApplyRecordModel,
                TemporaryDutyModel.duty_nm,
            )
            .join(
                TemporaryDutyApplyRecordModel,
                TemporaryDutyApplyRecordModel.id == ReviewRecordModel.apply_id,
            )
            .join(
                TemporaryDutyModel,
                TemporaryDutyModel.id == TemporaryDutyApplyRecordModel.duty_id,
            )
            .filter(ReviewRecordModel.reviewer == user_id)
        )
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total


class OperProjectDataModel:
    def query_project(self, empid, status_list, size, dev_pids):
        "查找我身為創建者/開發人員/產品PM/專案PM的專案"
        data = (
            db.session.query(
                ProjectDataModel.project_nm,
                ProjectDataModel.id,
                ProjectDataModel.product_pm,
                ProjectDataModel.group_id
            ).filter(
                or_(
                    ProjectDataModel.creator == empid,
                    ProjectDataModel.product_pm == empid,
                    ProjectDataModel.project_pm == empid,
                    ProjectDataModel.id.in_(dev_pids),
                ),
                ProjectDataModel.status.in_(status_list),
            )
            .order_by(
                ProjectDataModel.group_id.desc(), ProjectDataModel.created_at.desc()
            )
            .offset(0)
            .limit(size)
            .all()
        )
        return data

    def search_pro_data_by_pid(self, project_id):
        data = (
            db.session.query(ProjectDataModel, ProjectDataModel.status)
            .filter(ProjectDataModel.id == project_id)
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_pro_status(self, status, project_id):
        db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id == project_id
        ).update({"status": status, "status_update_at": get_now()})
        db.session.commit()
        return True

    def query_project_num_by_status(self, empid, status, dev_pids):
        data = (
            db.session.query(ProjectDataModel.id)
            .filter(
                or_(
                    ProjectDataModel.creator.contains(empid),
                    ProjectDataModel.product_pm.contains(empid),
                    ProjectDataModel.project_pm.contains(empid),
                    ProjectDataModel.id.in_(dev_pids),
                ),
                ProjectDataModel.status.in_(status),
            )
            .count()
        )
        return data


class OperTemporaryDutyModel:
    def query_temp_duty(self, empid, status, size):
        "查找我身為創建者/責任人的臨時任務"
        data = (
            db.session.query(
                TemporaryDutyModel.id,
                TemporaryDutyModel.duty_nm,
                TemporaryDutyModel.creator,
                TemporaryDutyModel.progress,
                TemporaryDutyModel.priority,
                TemporaryDutyModel.end_time,
                TemporaryDutyModel.expected_end_date,
                TemporaryDutyModel.expected_start_date,
                TemporaryDutyModel.latest_expected_end_date,
                TemporaryDutyModel.responsible,
                TemporaryDutyModel.revision_count,
                TemporaryDutyModel.start_time,
                TemporaryDutyModel.status
            ).filter(
                or_(
                    TemporaryDutyModel.creator == empid,
                    TemporaryDutyModel.responsible.contains(empid),
                ),
                TemporaryDutyModel.status == status,
            )
            .offset(0)
            .limit(size)
            .all()
        )
        return data


class OperRecordFormModel:
    def query_lastest_record(self, page, size):
        data = (
            db.session.query(OperRecordModel)
            .order_by(OperRecordModel.created_at.desc())
            .offset(5 * (page - 1))
            .limit(size)
            .all()
        )
        return data


class OperProjectGroupModel:
    def obtain_project_group_data(self):
        return db.session.query(ProjectGroupModel).all()
