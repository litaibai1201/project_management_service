# -*- coding: utf-8 -*-
"""
@文件: dashboard_config_controller.py
@说明: 首页 Widget 配置控制器
"""
import json
from utils.tools import CommonTools
from daos.dashboard_config_dao import DashboardConfigDAO
from tables.dashboard_table import UserDashboardConfigModel

_dao = DashboardConfigDAO()


# ── Widget 目录（定义顺序即默认排列顺序）──────────────────────────────────────

WIDGET_CATALOG = {
    "personal": [
        {"widget_id": "project_stats",      "label": "專案統計",   "removable": False},
        {"widget_id": "task_stats",         "label": "任務統計",   "removable": False},
        {"widget_id": "pending_review",     "label": "待處理",     "removable": True},
        {"widget_id": "daily_log",          "label": "工作日誌提醒", "removable": True},
        {"widget_id": "my_projects",        "label": "我參與的專案", "removable": True},
        {"widget_id": "my_tasks",           "label": "我負責的任務", "removable": True},
        {"widget_id": "my_pending_review",  "label": "待我審批",   "removable": True},
        {"widget_id": "monthly_attendance", "label": "本月出勤",   "removable": True},
        {"widget_id": "activity_chart",     "label": "本週活動概覽", "removable": True},
        {"widget_id": "latest_news",        "label": "近期動態",   "removable": True},
    ],
    "manager": [
        {"widget_id": "team_project",          "label": "團隊專案",       "removable": False},
        {"widget_id": "team_task",             "label": "團隊任務",       "removable": False},
        {"widget_id": "team_pending",          "label": "待處理",         "removable": False},
        {"widget_id": "team_size",             "label": "下屬人數",       "removable": True},
        {"widget_id": "daily_report_status",   "label": "日報提交",       "removable": True},
        {"widget_id": "member_task_chart",     "label": "任務分佈圖",     "removable": True},
        {"widget_id": "member_detail",         "label": "成員明細",       "removable": True},
        {"widget_id": "team_task_pie",         "label": "任務狀態占比",   "removable": True},
        {"widget_id": "team_project_status",   "label": "專案狀態分佈",   "removable": True},
        {"widget_id": "team_project_progress", "label": "專案進度排行",   "removable": True},
        {"widget_id": "team_log_today",        "label": "成員工時明細",   "removable": True},
        {"widget_id": "team_review_types",     "label": "審批類型分佈",   "removable": True},
        {"widget_id": "team_benefit",          "label": "年度效益統計",   "removable": True},
        {"widget_id": "team_benefit_detail",   "label": "效益專案明細",   "removable": True},
        {"widget_id": "team_requirement",      "label": "需求總覽",       "removable": True},
        {"widget_id": "team_ar_task",          "label": "AR 任務統計",    "removable": True},
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

        rows = _dao.list_by_user(work_no, view_type)
        saved_map = {r.widget_id: r for r in rows}

        result = []
        for w in catalog:
            if w["widget_id"] not in all_ids:
                continue
            row = saved_map.get(w["widget_id"])
            layout = None
            if row and row.layout_json:
                try:
                    layout = json.loads(row.layout_json)
                except (ValueError, TypeError):
                    pass
            result.append({
                "widget_id":  w["widget_id"],
                "label":      w["label"],
                "removable":  w["removable"],
                "is_visible": row.is_visible if row else True,
                "layout":     layout,
            })
        return result

    def save_config(self, work_no: str, view_type: str, widgets: list) -> None:
        """
        批量 upsert widget 配置（可见性 + 布局）。
        widgets: [{"widget_id": str, "is_visible": bool, "layout": {x,y,w,h}|None}, ...]
        """
        now = CommonTools.get_now()
        for w in widgets:
            widget_id   = w.get("widget_id")
            is_visible  = bool(w.get("is_visible", True))
            layout      = w.get("layout")
            layout_json = json.dumps(layout) if layout else None

            existing = _dao.find_one(work_no, view_type, widget_id)
            if existing:
                existing.is_visible  = is_visible
                existing.updated_at  = now
                if layout_json is not None:
                    existing.layout_json = layout_json
            else:
                _dao.add(UserDashboardConfigModel(
                    work_no=work_no,
                    view_type=view_type,
                    widget_id=widget_id,
                    is_visible=is_visible,
                    layout_json=layout_json,
                ))
        _dao.commit()
