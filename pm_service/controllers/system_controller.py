# -*- coding: utf-8 -*-
"""系统管理控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import SystemModel, UserProfileModel
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException


class SystemController:

    def list_systems(self, payload: dict):
        keyword   = payload.get("keyword", "")
        sys_group = payload.get("sys_group", "")
        page      = int(payload.get("page", 1))
        size      = int(payload.get("size", 50))

        q = db.session.query(SystemModel).filter(SystemModel.sys_status != 9)
        if keyword:
            q = q.filter(SystemModel.sys_nm.like(f"%{keyword}%"))
        if sys_group:
            q = q.filter(SystemModel.sys_group == sys_group)

        total = q.count()
        items = q.order_by(SystemModel.sys_nm.asc()).offset((page - 1) * size).limit(size).all()

        # 批量查维护人员名称
        all_nos: set[str] = set()
        for item in items:
            try:
                nos = json.loads(item.maintainers) if item.maintainers else []
                all_nos.update(nos)
            except Exception:
                pass
        name_map: dict[str, str] = {}
        if all_nos:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(all_nos)
            ).all()
            name_map = {u.work_no: u.name for u in users}

        data = []
        for item in items:
            d = item.to_dict()
            d["maintainer_names"] = [
                {"work_no": wn, "name": name_map.get(wn, wn)}
                for wn in d["maintainers"]
            ]
            data.append(d)

        return {"data_list": data, "total_count": total, "page": page, "size": size}

    def get_system(self, system_id: str):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")
        d = s.to_dict()
        # 查维护人员名称
        name_map: dict[str, str] = {}
        if d["maintainers"]:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(d["maintainers"])
            ).all()
            name_map = {u.work_no: u.name for u in users}
        d["maintainer_names"] = [
            {"work_no": wn, "name": name_map.get(wn, wn)}
            for wn in d["maintainers"]
        ]
        return d

    def create_system(self, payload: dict):
        maintainers = payload.get("maintainers", [])
        if isinstance(maintainers, str):
            try:
                maintainers = json.loads(maintainers)
            except Exception:
                maintainers = []

        urls = payload.get("urls", [])
        if isinstance(urls, str):
            try:
                urls = json.loads(urls)
            except Exception:
                urls = []

        deploy_info = payload.get("deploy_info", [])
        if isinstance(deploy_info, str):
            try:
                deploy_info = json.loads(deploy_info)
            except Exception:
                deploy_info = []

        s = SystemModel(
            sys_nm=payload["sys_nm"],
            sys_group=payload.get("sys_group", ""),
            maintainers=json.dumps(maintainers, ensure_ascii=False),
            description=payload.get("description", ""),
            go_live_date=payload.get("go_live_date", ""),
            urls_json=json.dumps(urls, ensure_ascii=False),
            deploy_info_json=json.dumps(deploy_info, ensure_ascii=False),
        )
        db.session.add(s)
        db.session.commit()
        return s.to_dict()

    def update_system(self, system_id: str, payload: dict):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")

        if "sys_nm" in payload:
            s.sys_nm = payload["sys_nm"]
        if "sys_group" in payload:
            s.sys_group = payload["sys_group"]
        if "description" in payload:
            s.description = payload["description"]
        if "go_live_date" in payload:
            s.go_live_date = payload["go_live_date"]
        if "maintainers" in payload:
            m = payload["maintainers"]
            if isinstance(m, str):
                try:
                    m = json.loads(m)
                except Exception:
                    m = []
            s.maintainers = json.dumps(m, ensure_ascii=False)
        if "urls" in payload:
            u = payload["urls"]
            if isinstance(u, str):
                try:
                    u = json.loads(u)
                except Exception:
                    u = []
            s.urls_json = json.dumps(u, ensure_ascii=False)
        if "deploy_info" in payload:
            di = payload["deploy_info"]
            if isinstance(di, str):
                try:
                    di = json.loads(di)
                except Exception:
                    di = []
            s.deploy_info_json = json.dumps(di, ensure_ascii=False)

        s.updated_at = CommonTools.get_now()
        db.session.commit()
        return s.to_dict()

    def delete_system(self, system_id: str):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")
        s.sys_status = 9
        s.updated_at = CommonTools.get_now()
        db.session.commit()
        return True

    def list_groups(self):
        """获取所有系统分组（去重）"""
        rows = db.session.query(SystemModel.sys_group).filter(
            SystemModel.sys_status != 9,
            SystemModel.sys_group.isnot(None),
            SystemModel.sys_group != "",
        ).distinct().all()
        return [r[0] for r in rows]
