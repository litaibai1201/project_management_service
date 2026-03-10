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

from common.common_tools import TryExcept, get_now, member_match
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (DutyApplyReviewerModel,
                                       DutyProgressReaderModel,
                                       DutyResponsibleModel,
                                       FunctionDataModel,
                                       FunctionDeveloperModel,
                                       OperRecordModel,
                                       ProgressReaderModel,
                                       ProgressRecordDataModel,
                                       ProjectApplyRecordModel,
                                       ProjectApplyReviewerModel,
                                       ProjectDataModel, ProjectGroupModel,
                                       ReviewRecordModel,
                                       TemporaryDutyApplyRecordModel,
                                       TemporaryDutyModel,
                                       TemporaryDutyRecordDataModel,
                                       UserHierarchyModel, UserProfileModel)


def get_user_name(work_no):
    """根據工號從本地 UserProfileModel 查詢員工姓名。"""
    user = db.session.query(UserProfileModel).filter_by(work_no=work_no).first()
    return user.name if user else work_no


def get_subordinate_ids(empid):
    """根據工號從本地 UserHierarchyModel 查詢所有直屬下屬工號列表（含本人）。"""
    rows = db.session.query(UserHierarchyModel).filter_by(supervisor_work_no=empid).all()
    return [empid] + [row.subordinate_work_no for row in rows]


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
            .join(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                DutyResponsibleModel.work_no == empid,
                TemporaryDutyModel.progress < 100,
                TemporaryDutyModel.status.in_([1, 2]),
            )
            .all()
        )
        return data

    def query_task_num_by_emp_n_status(self, empid, status):
        responsible_subq = (
            db.session.query(DutyResponsibleModel.duty_id)
            .filter(DutyResponsibleModel.work_no == empid)
            .subquery()
        )
        data = (
            db.session.query(TemporaryDutyModel.id)
            .filter(
                or_(
                    TemporaryDutyModel.id.in_(responsible_subq),
                    TemporaryDutyModel.creator == empid,
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
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                ProjectDataModel.status == 5,
                FunctionDeveloperModel.work_no == empid,
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
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                FunctionDeveloperModel.work_no == empid,
                FunctionDataModel.status != 0,
            )
            .all()
        )
        ids = self.__extrct_column_values(data)
        return ids

    def query_progress_n_status_by_pid(self, pid):
        data = (
            db.session.query(FunctionDataModel.progress,
                             FunctionDataModel.status)
            .filter(FunctionDataModel.project_id == pid)
            .all()
        )
        return data

    def search_nm_by_fid_list(self, fid_list):
        data = (
            db.session.query(FunctionDataModel.id,
                             FunctionDataModel.function_nm)
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
            .outerjoin(
                ProgressReaderModel,
                and_(
                    ProgressReaderModel.progress_id == ProgressRecordDataModel.id,
                    ProgressReaderModel.work_no == empid,
                ),
            )
            .outerjoin(
                FunctionDeveloperModel,
                and_(
                    FunctionDeveloperModel.function_id == FunctionDataModel.id,
                    FunctionDeveloperModel.work_no == empid,
                ),
            )
            .filter(
                ProjectDataModel.status != 0,
                FunctionDataModel.status != 0,
                ProgressReaderModel.id.is_(None),  # 未读
                or_(
                    ProjectDataModel.product_pm == empid,
                    ProjectDataModel.project_pm == empid,
                    ProjectDataModel.creator == empid,
                    FunctionDeveloperModel.work_no == empid,
                ),
            )
            .count()
        )
        return data

    def query_temp_unread_record(self, empid):
        read_subq = (
            db.session.query(DutyProgressReaderModel.progress_id)
            .filter(DutyProgressReaderModel.work_no == empid)
            .subquery()
        )
        data = (
            db.session.query(TemporaryDutyRecordDataModel.id)
            .join(
                TemporaryDutyModel,
                TemporaryDutyModel.id == TemporaryDutyRecordDataModel.duty_id,
            )
            .join(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                DutyResponsibleModel.work_no == empid,
                ~TemporaryDutyRecordDataModel.id.in_(read_subq),
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
            .join(
                ProjectApplyReviewerModel,
                ProjectApplyReviewerModel.apply_id == ProjectApplyRecordModel.id,
            )
            .filter(
                ProjectApplyReviewerModel.work_no == empid,
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
            .join(
                DutyApplyReviewerModel,
                DutyApplyReviewerModel.apply_id == TemporaryDutyApplyRecordModel.id,
            )
            .filter(
                DutyApplyReviewerModel.work_no == empid,
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
            query = query.filter(
                TemporaryDutyApplyRecordModel.status == status)
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
                    ProjectDataModel.creator == empid,
                    member_match(ProjectDataModel.product_pm, empid),
                    member_match(ProjectDataModel.project_pm, empid),
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
            ).outerjoin(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            ).filter(
                or_(
                    TemporaryDutyModel.creator == empid,
                    DutyResponsibleModel.work_no == empid,
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


# ──────────────────────────────────────────────
#  用戶管理相關 DB 操作
# ──────────────────────────────────────────────

class OperUserProfileModel:
    """用戶資料表操作"""

    @TryExcept("新增用戶失敗")
    def add_user(self, data: dict):
        user = UserProfileModel(**data)
        db.session.add(user)
        db.session.commit()
        return True

    def query_user_by_work_no(self, work_no: str):
        """查詢單個正常狀態的用戶"""
        return (
            db.session.query(UserProfileModel)
            .filter(UserProfileModel.work_no == work_no, UserProfileModel.status == 1)
            .first()
        )

    def check_work_no_exists(self, work_no: str) -> bool:
        """檢查工號是否已存在（含已刪除）"""
        return (
            db.session.query(UserProfileModel)
            .filter(UserProfileModel.work_no == work_no)
            .first()
        ) is not None

    def query_users(self, page: int, size: int, keyword: str = "", department: str = ""):
        """查詢用戶列表，支持關鍵字搜尋和部門過濾"""
        from sqlalchemy import or_
        query = db.session.query(UserProfileModel).filter(
            UserProfileModel.status == 1)
        if keyword:
            query = query.filter(
                or_(
                    UserProfileModel.name.contains(keyword),
                    UserProfileModel.work_no.contains(keyword),
                )
            )
        if department:
            query = query.filter(UserProfileModel.department == department)
        total = query.count()
        data = (
            query.order_by(UserProfileModel.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
            .all()
        )
        return data, total

    @TryExcept("更新用戶失敗")
    def update_user(self, work_no: str, update_dict: dict):
        update_dict["updated_at"] = get_now()
        db.session.query(UserProfileModel).filter(
            UserProfileModel.work_no == work_no
        ).update(update_dict)
        db.session.commit()
        return True

    @TryExcept("刪除用戶失敗")
    def soft_delete_user(self, work_no: str):
        db.session.query(UserProfileModel).filter(
            UserProfileModel.work_no == work_no
        ).update({"status": 0, "status_update_at": get_now()})
        db.session.commit()
        return True

    def query_all_departments(self):
        """取得所有部門列表（去重）"""
        rows = (
            db.session.query(UserProfileModel.department)
            .filter(UserProfileModel.status == 1, UserProfileModel.department.isnot(None))
            .distinct()
            .all()
        )
        return [r[0] for r in rows if r[0]]


class OperUserHierarchyModel:
    """用戶層級關係表操作"""

    def check_relation_exists(self, supervisor_work_no: str, subordinate_work_no: str) -> bool:
        """檢查某主管-下屬關係是否已存在"""
        return (
            db.session.query(UserHierarchyModel)
            .filter(
                UserHierarchyModel.supervisor_work_no == supervisor_work_no,
                UserHierarchyModel.subordinate_work_no == subordinate_work_no,
            )
            .first()
        ) is not None

    @TryExcept("新增層級關係失敗")
    def add_relation(self, supervisor_work_no: str, subordinate_work_no: str, remark: str = ""):
        relation = UserHierarchyModel(
            id=get_timestamp(),
            supervisor_work_no=supervisor_work_no,
            subordinate_work_no=subordinate_work_no,
            remark=remark,
        )
        db.session.add(relation)
        db.session.commit()
        return True

    def get_relation_by_id(self, relation_id: str):
        return (
            db.session.query(UserHierarchyModel)
            .filter(UserHierarchyModel.id == relation_id)
            .first()
        )

    @TryExcept("刪除層級關係失敗")
    def delete_relation(self, relation_id: str):
        db.session.query(UserHierarchyModel).filter(
            UserHierarchyModel.id == relation_id
        ).delete()
        db.session.commit()
        return True

    def get_direct_subordinates(self, supervisor_work_no: str):
        """取得直屬下屬（含 relation_id、remark）"""
        return (
            db.session.query(
                UserHierarchyModel.id,
                UserHierarchyModel.subordinate_work_no,
                UserHierarchyModel.remark,
                UserHierarchyModel.created_at,
            )
            .filter(UserHierarchyModel.supervisor_work_no == supervisor_work_no)
            .all()
        )

    def get_direct_supervisors(self, subordinate_work_no: str):
        """取得直屬主管（含 relation_id、remark）"""
        return (
            db.session.query(
                UserHierarchyModel.id,
                UserHierarchyModel.supervisor_work_no,
                UserHierarchyModel.remark,
                UserHierarchyModel.created_at,
            )
            .filter(UserHierarchyModel.subordinate_work_no == subordinate_work_no)
            .all()
        )

    def get_all_subordinates(self, supervisor_work_no: str, max_depth: int = 5) -> list:
        """
        遞歸取得所有層級的下屬工號集合（含直屬及多級）
        :param max_depth: 最大遞歸深度，防止循環依賴造成死循環
        """
        visited = set()

        def _recurse(work_no: str, depth: int):
            if depth > max_depth or work_no in visited:
                return
            visited.add(work_no)
            rows = (
                db.session.query(UserHierarchyModel.subordinate_work_no)
                .filter(UserHierarchyModel.supervisor_work_no == work_no)
                .all()
            )
            for (sub_wn,) in rows:
                if sub_wn not in visited:
                    _recurse(sub_wn, depth + 1)

        _recurse(supervisor_work_no, 0)
        visited.discard(supervisor_work_no)
        return list(visited)

    def get_all_supervisors(self, subordinate_work_no: str, max_depth: int = 5) -> list:
        """
        遞歸取得所有層級的主管工號集合
        :param max_depth: 最大遞歸深度
        """
        visited = set()

        def _recurse(work_no: str, depth: int):
            if depth > max_depth or work_no in visited:
                return
            visited.add(work_no)
            rows = (
                db.session.query(UserHierarchyModel.supervisor_work_no)
                .filter(UserHierarchyModel.subordinate_work_no == work_no)
                .all()
            )
            for (sup_wn,) in rows:
                if sup_wn not in visited:
                    _recurse(sup_wn, depth + 1)

        _recurse(subordinate_work_no, 0)
        visited.discard(subordinate_work_no)
        return list(visited)

    def is_supervisor_of(self, supervisor_work_no: str, target_work_no: str) -> bool:
        """
        檢查 supervisor_work_no 是否是 target_work_no 的主管（直屬或多級）
        可用於權限判斷：主管可查看下屬的更新內容
        """
        all_subs = self.get_all_subordinates(supervisor_work_no)
        return target_work_no in all_subs
