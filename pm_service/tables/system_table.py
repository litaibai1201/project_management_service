# -*- coding: utf-8 -*-
"""
@文件: system_table.py
@说明: 系统管理数据表
"""
import json

from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


class SystemModel(BaseMixinModel):
    """系统管理"""
    __tablename__ = "system_form"

    id               = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    sys_nm           = db.Column(db.String(128), nullable=False, comment="系统名称")
    sys_group        = db.Column(db.String(64),  comment="所属分组")
    maintainers      = db.Column(db.Text, comment="维护人员工号JSON数组")
    description      = db.Column(db.Text, comment="系统功能介绍")
    go_live_date     = db.Column(db.String(10),  comment="系统上线时间")
    urls_json        = db.Column(db.Text, comment="访问网址列表JSON [{name,url}]")
    deploy_info_json = db.Column(db.Text, comment="部署详情JSON数组")
    sys_status       = db.Column(db.Integer, default=1, comment="1=正常 9=已删除")
    created_at       = db.Column(db.String(19), default=CommonTools.get_now, nullable=False)
    updated_at       = db.Column(db.String(19), default=CommonTools.get_now, onupdate=CommonTools.get_now)

    __table_args__ = (
        db.Index('ix_system_group', 'sys_group'),
        db.Index('ix_system_status', 'sys_status'),
    )

    def to_dict(self):
        def _load(field):
            try:
                return json.loads(field) if field else []
            except Exception:
                return []
        return {
            "id":          self.id,
            "sys_nm":      self.sys_nm,
            "sys_group":   self.sys_group or "",
            "maintainers": _load(self.maintainers),
            "description": self.description or "",
            "go_live_date":     self.go_live_date or "",
            "urls":             _load(self.urls_json),
            "deploy_info":      _load(self.deploy_info_json),
            "created_at":  self.created_at or "",
            "updated_at":  self.updated_at or "",
        }


class SystemConfigModel(db.Model):
    """系统配置"""
    __tablename__ = "system_config_form"

    id           = db.Column(db.String(32),  primary_key=True, default=generate_uuid)
    config_key   = db.Column(db.String(64),  nullable=False, unique=True, index=True, comment="配置键")
    config_value = db.Column(db.Text,        comment="配置值")
    description  = db.Column(db.String(255), comment="描述")
    updated_at   = db.Column(db.String(19),  default=CommonTools.get_now)

    def to_dict(self):
        return {
            "key": self.config_key, "value": self.config_value,
            "description": self.description, "updated_at": self.updated_at,
        }
