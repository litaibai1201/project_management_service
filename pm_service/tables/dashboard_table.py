# -*- coding: utf-8 -*-
"""
@文件: dashboard_table.py
@说明: 首页Widget配置数据表
"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import generate_uuid


class UserDashboardConfigModel(db.Model):
    __tablename__ = "user_dashboard_config"

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    work_no     = db.Column(db.String(50), nullable=False, index=True, comment="工号")
    view_type   = db.Column(db.String(20), nullable=False, comment="视角: personal | manager")
    widget_id   = db.Column(db.String(50), nullable=False, comment="Widget ID")
    is_visible  = db.Column(db.Boolean, nullable=False, default=True, comment="是否显示")
    layout_json = db.Column(db.Text, nullable=True, comment="布局JSON: {x,y,w,h}")
    created_at  = db.Column(db.String(19), default=CommonTools.get_now, comment="创建时间")
    updated_at  = db.Column(db.String(19), comment="更新时间")

    __table_args__ = (
        db.UniqueConstraint("work_no", "view_type", "widget_id", name="uq_user_dashboard_config"),
    )

    def to_dict(self):
        return {
            "widget_id":  self.widget_id,
            "is_visible": self.is_visible,
        }
