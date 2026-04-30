# -*- coding: utf-8 -*-
"""分组/成员管理控制器"""
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    UserProfileModel, ProjectDataModel, FunctionDataModel,
    TemporaryDutyModel, ProgressRecordDataModel, DutyProgressRecordModel,
)


class GroupController:

    def list_members(self, page=1, size=20, keyword=""):
        q = db.session.query(UserProfileModel).filter_by(status=1)
        if keyword:
            q = q.filter(
                db.or_(
                    UserProfileModel.work_no.like(f"%{keyword}%"),
                    UserProfileModel.name.like(f"%{keyword}%"),
                    UserProfileModel.department.like(f"%{keyword}%"),
                )
            )
        total = q.count()
        members = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [m.to_dict() for m in members],
        }

    def get_member_projects(self, work_no: str, page=1, size=20):
        # 查该用户作为 PM 的专案
        pm_ids = set(
            r.id for r in db.session.query(ProjectDataModel.id).filter(
                db.or_(
                    ProjectDataModel.project_pm == work_no,
                    ProjectDataModel.product_pm == work_no,
                ),
                ProjectDataModel.project_status != 9,
            ).all()
        )
        # 查该用户作为任务负责人参与的专案
        func_proj_ids = set(
            r.project_id for r in db.session.query(FunctionDataModel.project_id).filter(
                FunctionDataModel.status == 1,
                FunctionDataModel.responsible.like(f'%"{work_no}"%'),
            ).distinct().all()
        )
        all_ids = list(pm_ids | func_proj_ids)
        if not all_ids:
            return {"total_count": 0, "total_page": 0, "data_list": []}
        q = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.id.in_(all_ids),
            ProjectDataModel.project_status != 9,
        )
        total = q.count()
        projects = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [p.to_list_item() for p in projects],
        }

    def get_member_duties(self, work_no: str, page=1, size=20):
        q = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.responsible.like(f"%{work_no}%"),
            TemporaryDutyModel.duty_status != 9,
        )
        total = q.count()
        duties = q.offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [d.to_dict() for d in duties],
        }

    def get_statistical_data(self, work_no: str, start_date: str, end_date: str):
        proj_hours = (
            db.session.query(db.func.sum(ProgressRecordDataModel.time_consum))
            .filter(
                ProgressRecordDataModel.submitter == work_no,
                ProgressRecordDataModel.created_at >= start_date,
                ProgressRecordDataModel.created_at <= end_date + " 23:59:59",
            ).scalar()
        ) or 0
        duty_hours = (
            db.session.query(db.func.sum(DutyProgressRecordModel.time_consum))
            .filter(
                DutyProgressRecordModel.submitter == work_no,
                DutyProgressRecordModel.start_time >= start_date,
                DutyProgressRecordModel.start_time <= end_date,
            ).scalar()
        ) or 0
        total_hours = proj_hours + duty_hours
        completed = (
            db.session.query(FunctionDataModel)
            .filter(
                FunctionDataModel.responsible.like(f'%"{work_no}"%'),
                FunctionDataModel.function_status == 4,
            ).count()
        )
        return {
            "work_no": work_no,
            "total_hours": total_hours,
            "completed_tasks": completed,
        }

    def get_overview(self, work_no: str, start_date: str, end_date: str):
        import json
        from datetime import datetime, timedelta
        from dbs.mongo_db.client import mongo_client

        today = datetime.today().date()
        urgent_threshold = today + timedelta(days=7)

        # ── 工时（MongoDB） ───────────────────────────────────────────
        col = mongo_client.db["daily_logs"]
        log_query: dict = {"work_no": work_no}
        if start_date or end_date:
            log_query["log_date"] = {}
            if start_date:
                log_query["log_date"]["$gte"] = start_date
            if end_date:
                log_query["log_date"]["$lte"] = end_date
        logs = list(col.find(log_query))
        total_hours = round(sum(float(lg.get("total_hours") or 0) for lg in logs), 1)

        # 按周聚合
        weekly_map: dict = {}
        for lg in logs:
            log_date = lg.get("log_date")
            if not log_date:
                continue
            try:
                d = datetime.strptime(str(log_date), "%Y-%m-%d").date()
            except ValueError:
                continue
            monday = d - timedelta(days=d.weekday())
            sunday = monday + timedelta(days=6)
            week_key = f"{monday.strftime('%m/%d')}~{sunday.strftime('%m/%d')}"
            weekly_map[week_key] = round(
                weekly_map.get(week_key, 0) + float(lg.get("total_hours") or 0), 1
            )
        weekly_hours = [{"week": k, "hours": v} for k, v in sorted(weekly_map.items())]

        # ── 任务统计（MySQL） ──────────────────────────────────────────
        completed_tasks = 0
        in_progress_tasks = 0
        overdue_tasks = 0

        all_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
            FunctionDataModel.responsible.like(f'%"{work_no}"%'),
        ).all()
        for f in all_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            if work_no not in resp:
                continue
            s = f.function_status or 0
            if s == 4:
                completed_tasks += 1
            elif s in (1, 2, 3):
                in_progress_tasks += 1
                end = f.expected_end_date
                if end:
                    try:
                        if datetime.strptime(end, "%Y-%m-%d").date() < today:
                            overdue_tasks += 1
                    except ValueError:
                        pass

        all_duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.status == 1,
            TemporaryDutyModel.responsible.like(f"%{work_no}%"),
        ).all()
        for d in all_duties:
            resp = json.loads(d.responsible) if d.responsible else []
            if work_no not in resp:
                continue
            s = d.duty_status or 0
            if s == 4:
                completed_tasks += 1
            elif s in (1, 2, 3):
                in_progress_tasks += 1
                end = d.latest_expected_end_date or d.expected_end_date
                if end:
                    try:
                        if datetime.strptime(end, "%Y-%m-%d").date() < today:
                            overdue_tasks += 1
                    except ValueError:
                        pass

        return {
            "total_hours":       total_hours,
            "completed_tasks":   completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "overdue_tasks":     overdue_tasks,
            "weekly_hours":      weekly_hours,
        }

    def get_schedule(self, work_no: str, start_date: str = "", end_date: str = ""):
        q = db.session.query(ProgressRecordDataModel).filter(
            ProgressRecordDataModel.submitter == work_no
        )
        if start_date:
            q = q.filter(ProgressRecordDataModel.created_at >= start_date)
        if end_date:
            q = q.filter(ProgressRecordDataModel.created_at <= end_date + " 23:59:59")
        records = q.order_by(ProgressRecordDataModel.created_at).all()
        return [r.to_dict() for r in records]

    def produce_report(self, work_no: str, start_date: str = "", end_date: str = ""):
        """生成工作报告数据（实际项目可生成 PDF/Excel）"""
        stat = self.get_statistical_data(work_no, start_date or "2000-01-01", end_date or "2099-12-31")
        return {
            "work_no": work_no,
            "start_date": start_date,
            "end_date": end_date,
            "report_data": stat,
            "message": "报告数据已生成，可下载或发送",
        }

    def send_report(self, work_no: str, start_date: str, end_date: str, email: str = ""):
        """发送报告（stub，实际接入邮件服务）"""
        return {"message": f"报告已发送至 {email or '默认邮箱'}", "work_no": work_no}
