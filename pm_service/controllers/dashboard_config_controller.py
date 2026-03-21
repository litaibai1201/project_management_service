# -*- coding: utf-8 -*-
"""首页 Widget 配置控制器"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import UserDashboardConfigModel


# ── Widget 目录（定义顺序即默认排列顺序）──────────────────────────────────────

WIDGET_CATALOG = {
    "personal": [
        {"widget_id": "project_stats",      "label": "專案統計",   "removable": False},
        {"widget_id": "task_stats",         "label": "任務統計",   "removable": False},
        {"widget_id": "pending_review",     "label": "待處理",     "removable": True},
        {"widget_id": "daily_log",          "label": "工作日誌提醒", "removable": True},
        {"widget_id": "my_projects",        "label": "我的專案",   "removable": True},
        {"widget_id": "monthly_attendance", "label": "本月出勤",   "removable": True},
        {"widget_id": "activity_chart",     "label": "本週活動概覽", "removable": True},
        {"widget_id": "latest_news",        "label": "近期動態",   "removable": True},
    ],
    "manager": [
        {"widget_id": "team_project",          "label": "團隊專案",   "removable": False},
        {"widget_id": "team_task",             "label": "團隊任務",   "removable": False},
        {"widget_id": "team_pending",          "label": "待處理",     "removable": False},
        {"widget_id": "team_size",             "label": "下屬人數",   "removable": True},
        {"widget_id": "daily_report_status",   "label": "日報提交",   "removable": True},
        {"widget_id": "member_task_chart",     "label": "任務分佈圖", "removable": True},
        {"widget_id": "member_detail",         "label": "成員明細",   "removable": True},
    ],
}


class DashboardConfigController:

    def get_config(self, work_no: str, view_type: str) -> list:
        """
        返回指定用户、指定视角的 widget 配置列表。
        若用户从未配置过，则按 WIDGET_CATALOG 默认全部可见返回。
        """
        catalog = WIDGET_CATALOG.get(view_type, [])
        all_ids = [w["widget_id"] for w in catalog]

        rows = (
            db.session.query(UserDashboardConfigModel)
            .filter_by(work_no=work_no, view_type=view_type)
            .all()
        )
        saved_map = {r.widget_id: r.is_visible for r in rows}

        return [
            {
                "widget_id":  w["widget_id"],
                "label":      w["label"],
                "removable":  w["removable"],
                "is_visible": saved_map.get(w["widget_id"], True),
            }
            for w in catalog
            if w["widget_id"] in all_ids
        ]

    def save_config(self, work_no: str, view_type: str, widgets: list) -> None:
        """
        批量 upsert widget 可见性配置。
        widgets: [{"widget_id": str, "is_visible": bool}, ...]
        """
        now = CommonTools.get_now()
        for w in widgets:
            widget_id  = w.get("widget_id")
            is_visible = bool(w.get("is_visible", True))

            existing = (
                db.session.query(UserDashboardConfigModel)
                .filter_by(work_no=work_no, view_type=view_type, widget_id=widget_id)
                .first()
            )
            if existing:
                existing.is_visible = is_visible
                existing.updated_at = now
            else:
                db.session.add(UserDashboardConfigModel(
                    work_no=work_no,
                    view_type=view_type,
                    widget_id=widget_id,
                    is_visible=is_visible,
                ))
        db.session.commit()
