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
        q = (
            db.session.query(ProjectDataModel)
            .filter(
                db.or_(
                    ProjectDataModel.project_pm == work_no,
                    ProjectDataModel.product_pm == work_no,
                ),
                ProjectDataModel.project_status != 9,
            )
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
                ProgressRecordDataModel.start_time >= start_date,
                ProgressRecordDataModel.start_time <= end_date,
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
        stat = self.get_statistical_data(work_no, start_date, end_date)
        projects = self.get_member_projects(work_no, page=1, size=100)["data_list"]
        duties = self.get_member_duties(work_no, page=1, size=100)["data_list"]
        return {
            "stat": stat,
            "projects": projects,
            "duties": duties,
        }

    def get_schedule(self, work_no: str, start_date: str = "", end_date: str = ""):
        q = db.session.query(ProgressRecordDataModel).filter(
            ProgressRecordDataModel.submitter == work_no
        )
        if start_date:
            q = q.filter(ProgressRecordDataModel.start_time >= start_date)
        if end_date:
            q = q.filter(ProgressRecordDataModel.start_time <= end_date)
        records = q.order_by(ProgressRecordDataModel.start_time).all()
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
