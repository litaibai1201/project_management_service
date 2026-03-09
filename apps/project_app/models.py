# -*- coding: utf-8 -*-
"""
@文件: test_model.py
@說明: 模型方法
@時間: 2023/10/26 17:13:07
@作者: LiDong
"""
from sqlalchemy import and_, asc, desc, func, not_, or_

from common.common_tools import TryExcept, get_now
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (FunctionDataModel, OperRecordModel,
                                       ProgressRecordDataModel,
                                       ProjectApplyRecordModel,
                                       ProjectDataModel, ProjectGroupModel,
                                       ReviewRecordModel)


class OperProjectDataModel:
    @TryExcept("數據插入失敗")
    def add_data_to_db(self, data):
        db.session.add(data)

    def search_data_by_id(self, project_id):
        data = (
            db.session.query(ProjectDataModel).filter(
                ProjectDataModel.id == project_id, ProjectDataModel.status != 0
            )
        ).first()
        return data

    def search_delete_finish_data_by_pid(self, user_id, project_id):
        query = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id == project_id,
            ProjectDataModel.status.in_([0, 7]),
            ProjectDataModel.product_pm == user_id,
        )
        data = query.first()
        return query, data

    def search_pause_by_pid(self, user_id, project_id, status=[1, 2, 3, 4, 5, 6]):
        query = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id == project_id,
            ProjectDataModel.status.in_(status),
            or_(
                ProjectDataModel.product_pm == user_id,
                ProjectDataModel.project_pm == user_id
            )
        )
        data = query.first()
        return data

    @TryExcept("專案更新失敗")
    def update_status_by_query(self, query):
        query.update({"status": 5, "status_update_at": get_now()})

    @TryExcept("專案开发人员更新失敗")
    def update_developers_by_pid(self, pid, data):
        db.session.query(ProjectDataModel).filter(ProjectDataModel.id == pid).update(data)

    @TryExcept("專案更新失敗")
    def update_status_by_pid(self, pid, status):
        db.session.query(ProjectDataModel).filter(ProjectDataModel.id == pid).update({"status": status, "status_update_at": get_now()})

    def search_project_data_by_pid(self, project_id):
        data = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.status != 0,
            ProjectDataModel.id == project_id,
        ).first()
        return data

    def search_data_by_project_nm_and_department(self, payload):
        data = (
            db.session.query(ProjectDataModel).filter(
                ProjectDataModel.project_nm == payload["project_nm"],
                ProjectDataModel.department == payload["department"],
                ProjectDataModel.status != 0,
            )
        ).first()
        return data

    def search_data_by_pid(self, project_id):
        data = (
            db.session.query(ProjectDataModel)
            .filter(ProjectDataModel.id == project_id)
            .first()
        )
        return data

    def search_pro_id(self, page_num, count, status, empid):
        data = (
            db.session.query(ProjectDataModel.id)
            .join(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
            )
            .filter(
                ProjectDataModel.status == 5,
                FunctionDataModel.developers.contains(empid),
                FunctionDataModel.status.in_(status),
            )
            .distinct()
            .slice((page_num - 1) * count, page_num * count)
            .all()
        )
        return data

    def search_projects_by_status(self, status, empid, pro_id_list):
        data = (
            db.session.query(ProjectDataModel, FunctionDataModel)
            .join(
                FunctionDataModel,
                FunctionDataModel.project_id == ProjectDataModel.id
            )
            .filter(
                FunctionDataModel.developers.contains(empid),
                FunctionDataModel.status.in_(status),
                ProjectDataModel.id.in_(pro_id_list),
            )
            .all()
        )
        return data

    def search_project_count_by_status(self, status, empid):
        count = (
            db.session.query(ProjectDataModel.id)
            .join(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
            )
            .filter(
                ~ProjectDataModel.status.in_([0, 7]),
                FunctionDataModel.developers.contains(empid),
                FunctionDataModel.status.in_(status),
            )
            .distinct()
            .count()
        )
        return count

    def __format_empid_filter(self, empid_list):
        filter_data = or_(
            or_(ProjectDataModel.creator == empid for empid in empid_list),
            or_(ProjectDataModel.product_pm == empid for empid in empid_list),
            or_(ProjectDataModel.project_pm == empid for empid in empid_list),
            or_(ProjectDataModel.developers.contains(empid) for empid in empid_list),
        )
        return filter_data

    def __column(self, column):
        return getattr(ProjectDataModel, column)

    def __create_order_filter(self, filter_data, column, sort_data):
        column = self.__column(column)
        if sort_data == 1:
            filter_data = filter_data.order_by(asc(column))
        elif sort_data == 2:
            filter_data = filter_data.order_by(desc(column))
        return filter_data

    def __format_order_filter(self, order_list, filter_data):
        for data in order_list:
            key = data.get("key")
            value = data.get("value")
            if key:
                filter_data = self.__create_order_filter(
                    filter_data, key, value
                )
        return filter_data

    def __search_data_list(self, empid_list, **kwargs):
        # page, size, keyword, status, group_id, project_pm
        # orderby
        session_data = db.session.query(
            ProjectDataModel
        )
        filter_data = self.__format_empid_filter(empid_list)
        session_data = session_data.filter(filter_data)
        keyword = kwargs.get("keyword", "")
        if keyword:
            session_data = session_data.filter(
                ProjectDataModel.project_nm.contains(keyword)
            )
        project_pm = kwargs.get("project_pm", "")
        if project_pm:
            session_data = session_data.filter(
                ProjectDataModel.project_pm == project_pm
            )
        status = kwargs.get("status")
        if status is not None:
            session_data = session_data.filter(
                ProjectDataModel.status == status
            )
        else:
            session_data = session_data.filter(ProjectDataModel.status != 0)
        group_id = kwargs.get("group_id", "")
        if group_id:
            session_data = session_data.filter(
                ProjectDataModel.group_id == group_id
            )
        order_list = kwargs.get("orderby", [])
        if order_list:
            session_data = self.__format_order_filter(order_list, session_data)
        else:
            session_data = session_data.order_by(
                desc(ProjectDataModel.created_at),
                asc(ProjectDataModel.expected_end_date)
            )
        return session_data

    def search_data_list(self, empid_list, **kwargs):
        session_data = self.__search_data_list(empid_list, **kwargs)
        page = kwargs.get("page", 1)
        size = kwargs.get("size", 10)
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    def search_by_function(self, id):
        data = (
            db.session.query(FunctionDataModel).filter(
                FunctionDataModel.project_id == id,
                FunctionDataModel.status != 0,
                FunctionDataModel.status != 3,
            )
        ).all()
        return data

    def search_by_empid(self, empid, page, size):
        session_data = (
            db.session.query(
                ProjectDataModel.id,
                ProjectDataModel.project_nm,
                func.count(ProjectDataModel.id).label("total_record_num"),
            )
            .join(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
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
            .group_by(ProjectDataModel.id, ProjectDataModel.project_nm)
        )
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    @TryExcept("數據更新失敗")
    def update_status(self, status, review_id):
        db.session.query(ProjectDataModel).filter(
            ProjectApplyRecordModel.project_id == ProjectDataModel.id,
            ProjectApplyRecordModel.id == review_id,
        ).update({"status": status, "status_update_at": get_now()})

    @TryExcept("專案更新失敗")
    def update_data_by_id(self, project_id, project_info):
        db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id == project_id
        ).update(project_info)

    @TryExcept("專案刪除失敗")
    def delete_data(self, project_id):
        db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id == project_id, ProjectDataModel.status != 0
        ).update({"status": 0, "status_update_at": get_now()})

    def serach_data_by_review_id(self, review_id):
        return (
            db.session.query(ProjectDataModel)
            .join(
                ProjectApplyRecordModel,
                ProjectApplyRecordModel.project_id == ProjectDataModel.id,
            )
            .filter(ProjectApplyRecordModel.id == review_id)
            .first()
        )


class OperFunctionDataModel:

    @TryExcept("數據插入失敗")
    def add_data_to_db(self, data):
        db.session.add(data)

    def search_fun_data_by_fid(self, project_id, function_id):
        data = FunctionDataModel.query.filter(
            FunctionDataModel.id == function_id,
            FunctionDataModel.project_id == project_id,
            FunctionDataModel.status != 0,
        ).first()
        return data

    def search_func_by_id(self, user_id, project_id, func_id, status=[1, 2, 4]):
        data = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status.in_(status),
            FunctionDataModel.id == func_id,
            FunctionDataModel.project_id == ProjectDataModel.id,
            FunctionDataModel.project_id == project_id,
            or_(
                ProjectDataModel.product_pm == user_id,
                ProjectDataModel.project_pm == user_id,
                FunctionDataModel.developers.contains(user_id)
            )
        ).first()
        return data

    def search_func_data_and_project_pm(self, project_id, function_id):
        data = (
            db.session.query(
                FunctionDataModel,
                ProjectDataModel.project_pm
            ).join(
                ProjectDataModel,
                FunctionDataModel.project_id == ProjectDataModel.id
            ).filter(
                FunctionDataModel.id == function_id,
                FunctionDataModel.project_id == project_id,
                FunctionDataModel.status != 0,
            ).first()
        )
        return data

    def search_fun_data_by_pid(self, project_id):
        datalist = (
            FunctionDataModel.query.filter(
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id == project_id,
            )
            .order_by(FunctionDataModel.created_at.desc())
            .all()
        )
        return datalist

    def search_func_nm_n_priority_by_id(self, function_id):
        data = (
            db.session.query(FunctionDataModel.function_nm)
            .filter(FunctionDataModel.id == function_id)
            .first()
        )
        return data

    def search_data_by_project_id_and_function_nm(self, project_id, payload):
        session_data = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.project_id == project_id,
            FunctionDataModel.function_nm == payload["function_nm"],
            FunctionDataModel.group1 == payload["group1"],
            FunctionDataModel.status != 0,
        )
        group2 = payload.get("group2")
        if group2:
            session_data = session_data.filter(
                FunctionDataModel.group2 == group2,
            )
        data = session_data.first()
        return data

    def search_data_by_pid(self, project_id):
        data = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.project_id == project_id,
                FunctionDataModel.status != 0,
            )
            .order_by(
                FunctionDataModel.expected_start_date.asc(),
                FunctionDataModel.group1.asc(),
                FunctionDataModel.group2.asc()
            )
            .all()
        )
        return data

    @TryExcept("功能進度記錄數據更新失敗")
    def update_data(self, function_id, data_dict):
        db.session.query(FunctionDataModel).filter(
            FunctionDataModel.id == function_id,
        ).update(data_dict)

    @TryExcept("功能刪除失敗")
    def update_status_to_deleted(self, function_id):
        update_dict = {"status": 0, "status_update_at": get_now()}
        db.session.query(FunctionDataModel).filter(
            FunctionDataModel.id == function_id
        ).update(update_dict)
        return True

    @TryExcept("狀態更新失敗")
    def update_status(self, status, review_id):
        update_dict = {"status": status, "status_update_at": get_now()}
        db.session.query(FunctionDataModel).filter(
            FunctionDataModel.id == ProjectApplyRecordModel.function_id,
            ProjectApplyRecordModel.id == review_id,
        ).update(update_dict)
        return True

    def search_data_by_pro_id_list(self, pro_id_list):
        datalist = (
            db.session.query(FunctionDataModel)
            .filter(FunctionDataModel.project_id.in_(pro_id_list))
            .all()
        )
        return datalist

    def __format_filter_data(self, session_data, **kwargs):
        keyword = kwargs.get("keyword", "")
        if keyword:
            session_data = session_data.filter(
                FunctionDataModel.function_nm.contains(keyword)
            )
        status = kwargs.get("status")
        if status is not None:
            session_data = session_data.filter(
                FunctionDataModel.status == status
            )
        else:
            session_data = session_data.filter(FunctionDataModel.status != 0)
        developers = kwargs.get("developers", "")
        if developers:
            session_data = session_data.filter(
                or_(FunctionDataModel.developers.contains(developers))
            )
        priority = kwargs.get("priority")
        if priority is not None:
            session_data = session_data.filter(
                FunctionDataModel.priority == priority
            )
        return session_data

    def __column(self, column):
        return getattr(FunctionDataModel, column)

    def __create_order_filter(self, filter_data, column, sort_data):
        column = self.__column(column)
        if sort_data == 1:
            filter_data = filter_data.order_by(asc(column))
        elif sort_data == 2:
            filter_data = filter_data.order_by(desc(column))
        return filter_data

    def __format_order_filter(self, order_list, session_data):
        for data in order_list:
            key = data.get("key")
            value = data.get("value")
            if key:
                session_data = self.__create_order_filter(
                    session_data, key, value
                )
        return session_data

    def __search_data_by_filter(self, project_id, empid, id_list, **kwargs):
        """page, size, keyword, developers, status
        orderby: priority, progress, expected_start_date, expected_end_date
        start_time, end_time
        """
        session_data = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.project_id == project_id
        )
        if empid not in id_list:
            session_data = session_data.filter(
                FunctionDataModel.developers.contains(empid)
            )
        session_data = self.__format_filter_data(session_data, **kwargs)
        order_list = kwargs.get("orderby", list())
        if order_list:
            session_data = self.__format_order_filter(order_list, session_data)
        else:
            session_data = session_data.order_by(
                desc(FunctionDataModel.expected_start_date),
                asc(FunctionDataModel.expected_end_date)
            )
        return session_data

    def search_data_list(self, project_id, empid, id_list, **kwargs):
        session_data = self.__search_data_by_filter(
            project_id, empid, id_list, **kwargs
        )
        page = kwargs.get("page", 1)
        size = kwargs.get("size", 10)
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    def search_by_empid(self, empid, project_id, page, size):
        session_data = (
            db.session.query(
                FunctionDataModel.id,
                FunctionDataModel.function_nm,
                func.count(FunctionDataModel.id).label("record_num"),
            ).join(
                ProjectDataModel,
                ProjectDataModel.id == FunctionDataModel.project_id
            ).join(
                ProgressRecordDataModel,
                ProgressRecordDataModel.function_id == FunctionDataModel.id,
            ).filter(
                FunctionDataModel.status != 0,
                FunctionDataModel.project_id == project_id,
                ~ProgressRecordDataModel.reader.contains(empid),
                or_(
                    ProjectDataModel.product_pm == empid,
                    ProjectDataModel.project_pm == empid,
                    ProjectDataModel.creator == empid,
                    FunctionDataModel.developers.contains(empid),
                ),
            )
            .group_by(FunctionDataModel.id, FunctionDataModel.function_nm)
        )
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count


class OperProgressRecordDataModel:
    @TryExcept("進度記錄數據插入失敗")
    def add_data_to_db(self, data):
        db.session.add(data)

    @TryExcept("已讀人員更新失敗")
    def update_data_to_db(self, data, progress_id):
        db.session.query(ProgressRecordDataModel).filter(
            ProgressRecordDataModel.id == progress_id
        ).update(data)

    def __session_data(self, function_id):
        session_data = db.session.query(ProgressRecordDataModel).filter(
            ProgressRecordDataModel.function_id == function_id
        )
        return session_data

    def __search_data(self, function_id, empid, unread):
        session_data = self.__session_data(function_id)
        if unread == 1:
            session_data = session_data.filter(
                not_(ProgressRecordDataModel.reader.contains(empid))
            )
        session_data = session_data.order_by(ProgressRecordDataModel.id.desc())
        return session_data

    def search_data_by_empid(self, empid, func_id, page, size, unread):
        session_data = self.__search_data(func_id, empid, unread)
        datalist = session_data.slice((page - 1) * size, page * size).all()
        count = session_data.count()
        return datalist, count

    def serach_data_by_fid(self, fid_list):
        session_data = (
            db.session.query(
                ProgressRecordDataModel.time_consum, ProgressRecordDataModel.function_id
            )
            .join(
                FunctionDataModel,
                FunctionDataModel.id == ProgressRecordDataModel.function_id,
            )
            .filter(ProgressRecordDataModel.function_id.in_(fid_list))
        ).all()
        return session_data


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


class OperRecordFormModel:
    def search_data_by_project_id(self, project_id):
        member_dynamics_data = (
            db.session.query(OperRecordModel)
            .filter(
                OperRecordModel.matter_id == project_id,
            )
            .all()
        )
        return member_dynamics_data


class OperProjectApplyRecordModel:
    @TryExcept("數據插入失敗")
    def add_data_to_db(self, data):
        db.session.add(data)

    def search_data_by_review_id(self, review_id):
        data = (
            db.session.query(ProjectApplyRecordModel)
            .filter(ProjectApplyRecordModel.id == review_id)
            .first()
        )
        return data

    @TryExcept("數據更新失敗")
    def update_status(self, status, review_id):
        update_data = {"status": status, "updated_at": get_now()}
        db.session.query(ProjectApplyRecordModel).filter(
            ProjectApplyRecordModel.id == review_id
        ).update(update_data)

    def get_project_apply_record(self, empid, page_num, count):
        apply_id_list = (
            db.session.query(ReviewRecordModel.apply_id)
            .filter(ReviewRecordModel.reviewer == empid)
            .all()
        )
        apply_id_list = [i[0] for i in apply_id_list if i]
        session_data = (
            db.session.query(
                ProjectApplyRecordModel,
                ProjectDataModel.project_nm,
            )
            .join(
                ProjectDataModel,
                ProjectDataModel.id == ProjectApplyRecordModel.project_id,
            )
            .filter(
                ProjectApplyRecordModel.status == 1,
                ProjectApplyRecordModel.reviewer.contains(empid),
                ~ProjectApplyRecordModel.id.in_(apply_id_list),
            )
        )
        find_apply_record = session_data.slice(
            (page_num - 1) * count, page_num * count
        ).all()
        total_count = session_data.count()
        return find_apply_record, total_count


class OperProjectGroupModel:
    def obtain_project_group_data(self):
        return db.session.query(
            ProjectGroupModel.id,
            ProjectGroupModel.group_name
        ).all()

    def obtain_project_group_data_by_pid(self, group_id):
        group_data = (
            db.session.query(ProjectGroupModel.group_name)
            .filter(ProjectGroupModel.id == group_id)
            .first()
        )
        return group_data
