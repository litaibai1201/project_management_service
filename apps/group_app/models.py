# -*- coding: utf-8 -*-
"""
@文件: models.py
@說明:
@時間: 2024/03/06 16:01:34
@作者: LiDong
"""


from functools import cached_property

from sqlalchemy import and_, asc, desc, func, or_

from common.common_tools import CommonTools, member_match
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (DutyResponsibleModel,
                                       FunctionDataModel,
                                       FunctionDeveloperModel,
                                       ProgressRecordDataModel,
                                       ProjectDataModel, ProjectGroupModel,
                                       TemporaryDutyModel,
                                       TemporaryDutyRecordDataModel)


class OperMemberDataModel:
    def search_project_total_num(self, user_id, start_date, end_date):
        total_num = (
            db.session.query(ProjectDataModel)
            .outerjoin(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
            )
            .outerjoin(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                func.str_to_date(ProjectDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                or_(
                    ProjectDataModel.creator == user_id,
                    ProjectDataModel.product_pm == user_id,
                    ProjectDataModel.project_pm == user_id,
                    FunctionDeveloperModel.work_no == user_id,
                ),
            )
            .distinct()
        )
        total_num = total_num.filter(
            or_(
                ~ProjectDataModel.status.in_([0, 7]),
                and_(
                    ProjectDataModel.status.in_([0, 7]),
                    func.str_to_date(
                        ProjectDataModel.status_update_at, "%Y-%m-%d")
                    >= func.str_to_date(start_date, "%Y-%m-%d"),
                    func.str_to_date(
                        ProjectDataModel.status_update_at, "%Y-%m-%d")
                    <= func.str_to_date(end_date, "%Y-%m-%d"),
                ),
            )
        )
        return total_num.count()

    def search_function_data(self, user_id):
        function_data = (
            db.session.query(FunctionDataModel)
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                FunctionDeveloperModel.work_no == user_id,
            )
            .all()
        )
        return function_data

    def search_duty_data(self, user_id):
        duty_data = (
            db.session.query(TemporaryDutyModel)
            .outerjoin(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                or_(
                    TemporaryDutyModel.creator == user_id,
                    DutyResponsibleModel.work_no == user_id,
                ),
            )
            .all()
        )
        return duty_data

    def search_func_data(self, user_id, now_time):
        return (
            db.session.query(FunctionDataModel)
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                or_(
                    FunctionDataModel.status == 1,
                    FunctionDataModel.status == 2,
                    FunctionDataModel.status == 4,
                ),
                FunctionDeveloperModel.work_no == user_id,
                FunctionDataModel.expected_end_date < now_time,
            )
            .first()
        )

    # ── 批量查询方法（解决 N+1 问题）────────────────────────────
    def batch_search_project_total_num(self, member_list, start_date, end_date):
        """
        批量查询每个成员的参与项目总数，返回 {work_no: count} 字典。
        一次 SQL 替代原先 N 次 COUNT 查询。
        """
        if not member_list:
            return {}
        rows = (
            db.session.query(
                ProjectDataModel.id,
                ProjectDataModel.creator,
                ProjectDataModel.product_pm,
                ProjectDataModel.project_pm,
                FunctionDeveloperModel.work_no.label("dev_work_no"),
            )
            .outerjoin(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
            )
            .outerjoin(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                func.str_to_date(ProjectDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                or_(
                    ~ProjectDataModel.status.in_([0, 7]),
                    and_(
                        ProjectDataModel.status.in_([0, 7]),
                        func.str_to_date(
                            ProjectDataModel.status_update_at, "%Y-%m-%d")
                        >= func.str_to_date(start_date, "%Y-%m-%d"),
                        func.str_to_date(
                            ProjectDataModel.status_update_at, "%Y-%m-%d")
                        <= func.str_to_date(end_date, "%Y-%m-%d"),
                    ),
                ),
            )
            .all()
        )
        # Python 侧归类：对每个成员统计其参与的不重复项目数
        member_project_sets = {m: set() for m in member_list}
        for pid, creator, product_pm, project_pm, dev_work_no in rows:
            for m in member_list:
                if m in (creator, product_pm, project_pm) or m == dev_work_no:
                    member_project_sets[m].add(pid)
        return {m: len(pids) for m, pids in member_project_sets.items()}

    def batch_search_function_data(self, member_list):
        """
        批量查询所有相关成员的功能数据，返回 {work_no: [FunctionDataModel, ...]} 字典。
        一次 SQL 替代原先 N 次查询。
        """
        if not member_list:
            return {m: [] for m in member_list}
        rows = (
            db.session.query(FunctionDataModel, FunctionDeveloperModel.work_no)
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(FunctionDeveloperModel.work_no.in_(member_list))
            .all()
        )
        result = {m: [] for m in member_list}
        for func_obj, work_no in rows:
            if work_no in result:
                result[work_no].append(func_obj)
        return result

    def batch_search_duty_data(self, member_list):
        """
        批量查询所有相关成员的临时任务数据，返回 {work_no: [TemporaryDutyModel, ...]} 字典。
        一次 SQL 替代原先 N 次查询。
        """
        if not member_list:
            return {m: [] for m in member_list}
        rows = (
            db.session.query(TemporaryDutyModel, DutyResponsibleModel.work_no)
            .outerjoin(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                or_(
                    TemporaryDutyModel.creator.in_(member_list),
                    DutyResponsibleModel.work_no.in_(member_list),
                )
            )
            .all()
        )
        result = {m: [] for m in member_list}
        seen = set()  # (duty_id, member) dedup
        for duty_obj, resp_work_no in rows:
            for m in member_list:
                if m in (duty_obj.creator, resp_work_no):
                    key = (duty_obj.id, m)
                    if key not in seen:
                        seen.add(key)
                        result[m].append(duty_obj)
        return result

    def batch_search_overdue_members(self, member_list, now_time):
        """
        批量查询哪些成员存在已超期的功能任务，返回超期成员工号的集合。
        一次 SQL 替代原先 N 次 first() 查询。
        """
        if not member_list:
            return set()
        rows = (
            db.session.query(FunctionDeveloperModel.work_no)
            .join(
                FunctionDataModel,
                FunctionDataModel.id == FunctionDeveloperModel.function_id,
            )
            .filter(
                FunctionDataModel.status.in_([1, 2, 4]),
                FunctionDataModel.expected_end_date < now_time,
                FunctionDeveloperModel.work_no.in_(member_list),
            )
            .distinct()
            .all()
        )
        overdue_members = {work_no for (work_no,) in rows}
        return overdue_members

    def search_pro_data_by_developers(self, user_id, page, size):
        query = (
            db.session.query(ProjectDataModel)
            .join(
                FunctionDataModel,
                FunctionDataModel.project_id == ProjectDataModel.id,
            )
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                ~ProjectDataModel.status.in_([0, 7]),
                FunctionDeveloperModel.work_no == user_id,
            )
            .order_by(ProjectDataModel.group_id.desc())
            .distinct()
        )
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total

    def search_fun_submit_record_data(self):
        return (
            db.session.query(
                ProgressRecordDataModel.function_id, ProgressRecordDataModel.time_consum
            ).distinct()
        ).all()

    def search_fun_data_by_pro_id(self, user_id, pro_id):
        data = (
            db.session.query(FunctionDataModel)
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                FunctionDeveloperModel.work_no == user_id,
                FunctionDataModel.project_id == pro_id,
            )
            .order_by(
                FunctionDataModel.group1.desc(),
                FunctionDataModel.group2.desc(),
                FunctionDataModel.created_at.desc(),
            )
            .all()
        )
        return data

    def search_fun_data_by_pro_id_not_developers(self, pro_id):
        data = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.project_id == pro_id,
            )
            .all()
        )
        return data

    def search_fun_record_by_fun_id(self, fun_id):
        data = (
            db.session.query(ProgressRecordDataModel)
            .filter(ProgressRecordDataModel.function_id == fun_id)
            .order_by(ProgressRecordDataModel.created_at.desc())
        ).first()
        return data

    def search_duty_data_by_responsible(self, user_id, page, size):
        query = (
            db.session.query(TemporaryDutyModel)
            .outerjoin(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                or_(
                    TemporaryDutyModel.creator == user_id,
                    DutyResponsibleModel.work_no == user_id,
                ),
                TemporaryDutyModel.status != 0,
            )
        )
        data = query.slice((page - 1) * size, page * size).all()
        total = query.count()
        return data, total

    def search_duty_submit_record_data(self):
        return (
            db.session.query(
                TemporaryDutyRecordDataModel.duty_id,
                TemporaryDutyRecordDataModel.time_consum,
            ).distinct()
        ).all()

    def search_duty_record_by_duty_id(self, duty_id):
        data = (
            db.session.query(TemporaryDutyRecordDataModel)
            .filter(TemporaryDutyRecordDataModel.duty_id == duty_id)
            .order_by(TemporaryDutyRecordDataModel.created_at.desc())
        ).first()
        return data

    def search_pro_fun_data_by_user_id(self, user_id):
        data = (
            db.session.query(ProjectDataModel, FunctionDataModel)
            .join(
                FunctionDataModel,
                FunctionDataModel.project_id == ProjectDataModel.id,
            )
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                FunctionDataModel.status.in_([1, 2, 4]),
                or_(
                    ProjectDataModel.project_pm == user_id,
                    FunctionDeveloperModel.work_no == user_id,
                ),
            )
            .all()
        )
        return data

    def search_duty_data_by_user_id(self, user_id):
        return (
            db.session.query(TemporaryDutyModel)
            .outerjoin(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                TemporaryDutyModel.status.in_([1, 2, 4]),
                or_(
                    TemporaryDutyModel.creator == user_id,
                    DutyResponsibleModel.work_no == user_id,
                ),
            )
            .all()
        )

    def search_pro_fun_prog_data_by_record_submitter(
        self, user_id, date_list
    ):
        query = (
            db.session.query(
                ProjectDataModel, FunctionDataModel, ProgressRecordDataModel
            )
            .join(
                FunctionDataModel,
                FunctionDataModel.project_id == ProjectDataModel.id,
            )
            .join(
                ProgressRecordDataModel,
                ProgressRecordDataModel.function_id == FunctionDataModel.id,
            )
            .filter(
                or_(
                    ProgressRecordDataModel.submitter == user_id,
                    member_match(ProgressRecordDataModel.cooperator, user_id),
                )
            )
        )
        query = query.filter(
            func.str_to_date(
                ProgressRecordDataModel.created_at,
                "%Y-%m-%d"
            ).in_(date_list),
        )
        data = query.all()
        return data

    def search_duty_data_by_record_submitter(self, user_id, date_list):
        query = (
            db.session.query(TemporaryDutyModel, TemporaryDutyRecordDataModel)
            .join(
                TemporaryDutyRecordDataModel,
                TemporaryDutyRecordDataModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                or_(
                    TemporaryDutyRecordDataModel.submitter == user_id,
                    member_match(TemporaryDutyRecordDataModel.cooperator, user_id),
                )
            )
        )
        query = query.filter(
            func.str_to_date(
                TemporaryDutyRecordDataModel.created_at,
                "%Y-%m-%d"
            ).in_(date_list)
        )
        data = query.all()
        return data

    def search_pro_data_by_submitter(self, member_list, start_date, end_date):
        query = (
            db.session.query(
                ProgressRecordDataModel.time_consum, ProgressRecordDataModel.submitter
            )
            .filter(
                func.str_to_date(
                    ProgressRecordDataModel.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d"),
                func.str_to_date(
                    ProgressRecordDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                ProgressRecordDataModel.submitter.in_(member_list),
            )
            .all()
        )
        return query

    def search_pro_data_by_fid_list(self, member_list, start_date, end_date, fid_list):
        data = (
            db.session.query(ProjectDataModel.id)
            .join(
                FunctionDataModel, FunctionDataModel.project_id == ProjectDataModel.id
            )
            .join(
                ProgressRecordDataModel,
                ProgressRecordDataModel.function_id == FunctionDataModel.id,
            )
            .filter(
                func.str_to_date(
                    ProgressRecordDataModel.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d"),
                func.str_to_date(
                    ProgressRecordDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                ProgressRecordDataModel.submitter.in_(member_list),
                ~FunctionDataModel.id.in_(fid_list),
            )
            .all()
        )
        return data

    def search_project_data_by_fid(
        self, member_list, start_date, end_date, unique_third_items
    ):
        data = (
            db.session.query(
                FunctionDataModel.start_time,
                FunctionDataModel.end_time,
                FunctionDeveloperModel.work_no.label("dev_work_no"),
            )
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(
                func.str_to_date(FunctionDataModel.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d"),
                func.str_to_date(FunctionDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                ~FunctionDataModel.id.in_(unique_third_items),
                FunctionDeveloperModel.work_no.in_(member_list),
            )
            .all()
        )
        return data

    def search_duty_data_by_submitter(self, member_list, start_date, end_date):
        data = (
            db.session.query(
                TemporaryDutyRecordDataModel.time_consum,
                TemporaryDutyRecordDataModel.submitter,
            )
            .filter(
                func.str_to_date(
                    TemporaryDutyRecordDataModel.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d"),
                func.str_to_date(
                    TemporaryDutyRecordDataModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                TemporaryDutyRecordDataModel.submitter.in_(member_list),
            )
            .all()
        )
        return data

    def search_duty_data_by_developers(
        self, member_list, start_date, end_date, unique_duty_list
    ):
        data = (
            db.session.query(
                TemporaryDutyModel.start_time,
                TemporaryDutyModel.end_time,
                DutyResponsibleModel.work_no.label("resp_work_no"),
            )
            .join(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                func.str_to_date(TemporaryDutyModel.created_at, "%Y-%m-%d")
                >= func.str_to_date(start_date, "%Y-%m-%d"),
                func.str_to_date(TemporaryDutyModel.created_at, "%Y-%m-%d")
                <= func.str_to_date(end_date, "%Y-%m-%d"),
                ~TemporaryDutyModel.id.in_(unique_duty_list),
                DutyResponsibleModel.work_no.in_(member_list),
            )
            .all()
        )
        return data


class OperFunctionDataModel:
    @cached_property
    def session_data(self):
        return db.session.query(FunctionDataModel)

    def __format_filter_data(self, stats, payload):
        start_date = payload.get("start_date")
        if start_date is not None:
            stats = stats.filter(
                FunctionDataModel.expected_end_date >= start_date
            )
        end_date = payload.get("end_date")
        if end_date is not None:
            stats = stats.filter(
                FunctionDataModel.expected_start_date <= end_date
            )
        project_id = payload.get("project_id")
        if project_id is not None:
            stats = stats.filter(FunctionDataModel.project_id == project_id)
        priority = payload.get("priority")
        if priority is not None:
            stats = stats.filter(FunctionDataModel.priority == priority)
        return stats

    def calculate_statistics(self, empid, payload):
        stats = (
            self.session_data
            .join(
                FunctionDeveloperModel,
                FunctionDeveloperModel.function_id == FunctionDataModel.id,
            )
            .filter(FunctionDeveloperModel.work_no == empid)
        )
        stats = self.__format_filter_data(stats, payload)
        all_t_num = stats.count()
        remain_t_num = stats.filter(
            FunctionDataModel.status in [1, 2, 4]
        ).count()
        delay_t_num = stats.filter(
            FunctionDataModel.status in [1, 2, 4],
            FunctionDataModel.expected_end_date < CommonTools.get_now("date")
        ).count()
        finished_t_num = stats.filter(
            FunctionDataModel.status == 3
        ).count()
        return {
            "all_t_num": all_t_num,
            "remain_t_num": remain_t_num,
            "delay_t_num": delay_t_num,
            "finished_t_num": finished_t_num
        }

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

    def search_func_by_schedule(self, payload, empid):
        stats = db.session.query(
            ProjectDataModel.id.label("project_id"),
            ProjectDataModel.project_nm,
            FunctionDataModel.id.label("function_id"),
            FunctionDataModel.function_nm,
            FunctionDataModel.expected_start_date,
            FunctionDataModel.expected_end_date,
            FunctionDataModel.latest_expected_end_date,
            FunctionDataModel.status,
            FunctionDataModel.priority
        ).join(
            FunctionDeveloperModel,
            FunctionDeveloperModel.function_id == FunctionDataModel.id,
        ).filter(
            FunctionDataModel.project_id == ProjectDataModel.id
        )
        stats = self.__format_filter_data(stats, payload)
        datalist = stats.filter(
            FunctionDeveloperModel.work_no == empid,
            FunctionDataModel.status.in_([1, 2, 4])
        ).all()
        return datalist

    def search_func(self, payload, empid):
        stats = db.session.query(
            FunctionDataModel,
            ProjectDataModel.project_nm,
            func.sum(
                ProgressRecordDataModel.time_consum
            ).label("total_working_hour")
        ).outerjoin(
            ProgressRecordDataModel,
            FunctionDataModel.id == ProgressRecordDataModel.function_id
        ).join(
            FunctionDeveloperModel,
            FunctionDeveloperModel.function_id == FunctionDataModel.id,
        ).group_by(
            ProjectDataModel.id, FunctionDataModel.id
        ).filter(
            ProjectDataModel.id == FunctionDataModel.project_id,
            FunctionDeveloperModel.work_no == empid
        )
        page = payload.pop("page", 1)
        size = payload.pop("size", 10)
        stats = self.__format_filter_data(stats, payload)
        status = payload.get("status")
        if status is not None:
            stats = stats.filter(FunctionDataModel.status == status)
        else:
            stats = stats.filter(FunctionDataModel.status != 0)
        order_list = payload.get("orderby", list())
        if order_list:
            stats = self.__format_order_filter(order_list, stats)
        else:
            stats = stats.order_by(asc(FunctionDataModel.expected_end_date))
        datalist = stats.slice((page - 1) * size, page * size).all()
        count = stats.count()
        return datalist, count


class OperTemporaryDutyModel:
    @cached_property
    def session_data(self):
        return db.session.query(TemporaryDutyModel)

    def __format_filter_data(self, stats, payload):
        start_date = payload.get("start_date")
        if start_date is not None:
            stats = stats.filter(
                TemporaryDutyModel.expected_start_date >= start_date
            )
        end_date = payload.get("end_date")
        if end_date is not None:
            stats = stats.filter(
                TemporaryDutyModel.expected_end_date <= end_date
            )
        return stats

    def search(self, payload, empid):
        stats = (
            self.session_data
            .join(
                DutyResponsibleModel,
                DutyResponsibleModel.duty_id == TemporaryDutyModel.id,
            )
            .filter(
                DutyResponsibleModel.work_no == empid,
                TemporaryDutyModel.status.in_([1, 2, 4])
            )
        )
        stats = self.__format_filter_data(stats, payload)
        datalist = stats.all()
        return datalist
