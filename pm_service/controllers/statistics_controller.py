# -*- coding: utf-8 -*-
"""统计控制器"""
import json
from datetime import datetime, timedelta
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    UserProfileModel, FunctionDataModel,
    TemporaryDutyModel, DailyLogModel,
)


class StatisticsController:

    def get_member_stats(self, work_no: str, start_date: str = None, end_date: str = None):
        """
        获取当前用户下属的工作统计（仅直接+间接下属，不含自身）
        返回字段与前端 MemberWorkStat 对应：
          work_no, name, total_hours,
          completed_tasks, overdue_tasks, overdue_days,
          in_progress_tasks, weekly_hours
        """
        from controllers.user_controller import UserController
        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if not sub_work_nos:
            return []

        users = (
            db.session.query(UserProfileModel)
            .filter(UserProfileModel.work_no.in_(sub_work_nos), UserProfileModel.status == 1)
            .all()
        )
        result = []
        for user in users:
            stat = self._build_member_stat(user, start_date, end_date)
            result.append(stat)
        return result

    def _build_member_stat(self, user: UserProfileModel, start_date, end_date):
        work_no = user.work_no
        today = datetime.today().date()

        # ── 功能任务统计 ───────────────────────────────────────────────
        all_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
            FunctionDataModel.responsible.like(f'%"{work_no}"%'),
        ).all()

        completed_tasks = 0
        in_progress_tasks = 0
        overdue_tasks = 0
        overdue_days = 0

        for f in all_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            if work_no not in resp:
                continue

            s = f.function_status or 0
            if s == 4:           # 已完成
                completed_tasks += 1
            elif s in (1, 2, 3): # 未开始/进行中/待验收
                in_progress_tasks += 1
                # 计算超期
                end = f.expected_end_date
                if end:
                    try:
                        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
                        if end_dt < today:
                            overdue_tasks += 1
                            overdue_days += (today - end_dt).days
                    except ValueError:
                        pass

        # ── 临时任务统计 ──────────────────────────────────────────────
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
                        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
                        if end_dt < today:
                            overdue_tasks += 1
                            overdue_days += (today - end_dt).days
                    except ValueError:
                        pass

        # ── 工时统计（从日志） ─────────────────────────────────────────
        lq = db.session.query(DailyLogModel).filter_by(work_no=work_no)
        if start_date:
            lq = lq.filter(DailyLogModel.log_date >= start_date)
        if end_date:
            lq = lq.filter(DailyLogModel.log_date <= end_date)
        logs = lq.all()
        total_hours = round(sum(float(lg.total_hours or 0) for lg in logs), 1)

        # ── 按周聚合工时 ──────────────────────────────────────────────
        weekly_map: dict = {}
        for lg in logs:
            if not lg.log_date:
                continue
            try:
                d = datetime.strptime(str(lg.log_date), "%Y-%m-%d").date()
            except ValueError:
                continue
            # 取该周周一作为 key
            monday = d - timedelta(days=d.weekday())
            week_key = monday.strftime("%Y-%m-%d")
            weekly_map[week_key] = round(
                weekly_map.get(week_key, 0) + float(lg.total_hours or 0), 1
            )

        weekly_hours = [
            {"week": k, "hours": v}
            for k, v in sorted(weekly_map.items())
        ]

        return {
            "work_no": work_no,
            "name": user.name,
            "department": user.department or "",
            "position": user.position or "",
            "total_hours": total_hours,
            "completed_tasks": completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "overdue_tasks": overdue_tasks,
            "overdue_days": overdue_days,
            "weekly_hours": weekly_hours,
        }
