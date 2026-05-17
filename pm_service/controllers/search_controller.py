# -*- coding: utf-8 -*-
"""搜索控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    ProjectDataModel, FunctionDataModel, TemporaryDutyModel,
)


class SearchController:

    def search(self, keyword: str, search_type: str = None, page: int = 1, size: int = 20):
        """全局搜索"""
        results = []

        if not search_type or search_type == "project":
            projects = self._search_projects(keyword)
            results.extend(projects)

        if not search_type or search_type == "function":
            functions = self._search_functions(keyword)
            results.extend(functions)

        if not search_type or search_type == "duty":
            duties = self._search_duties(keyword)
            results.extend(duties)

        total = len(results)
        start = (page - 1) * size
        paged = results[start: start + size]

        return {
            "total_count": total,
            "total_page": (total + size - 1) // size if size else 1,
            "data_list": paged,
        }

    def _search_projects(self, keyword: str):
        q = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.status == 1,
            ProjectDataModel.project_status != 9,
            db.or_(
                ProjectDataModel.project_nm.like(f"%{keyword}%"),
                ProjectDataModel.describe.like(f"%{keyword}%"),
            ),
        ).limit(50).all()
        return [
            {
                "id": p.id,
                "type": "project",
                "title": p.project_nm,
                "description": p.describe,
                "status": p.project_status,
                "created_at": str(p.created_at) if p.created_at else None,
            }
            for p in q
        ]

    def _search_functions(self, keyword: str):
        q = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.function_status != 9,
            db.or_(
                FunctionDataModel.function_nm.like(f"%{keyword}%"),
                FunctionDataModel.describe.like(f"%{keyword}%"),
            ),
        ).limit(50).all()
        return [
            {
                "id": f.id,
                "type": "function",
                "title": f.function_nm,
                "description": f.describe,
                "status": f.function_status,
                "project_id": f.project_id,
                "created_at": str(f.created_at) if f.created_at else None,
            }
            for f in q
        ]

    def _search_duties(self, keyword: str):
        q = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.duty_status != 9,
            db.or_(
                TemporaryDutyModel.duty_nm.like(f"%{keyword}%"),
                TemporaryDutyModel.describe.like(f"%{keyword}%"),
            ),
        ).limit(50).all()
        return [
            {
                "id": d.id,
                "type": "duty",
                "title": d.duty_nm,
                "description": d.describe,
                "status": d.duty_status,
                "created_at": str(d.created_at) if d.created_at else None,
            }
            for d in q
        ]

    def resolve_paths(self, ids: list):
        """批量解析 ID 对应的面包屑路径"""
        result = {}
        for item_id in ids:
            # 尝试在各个表中查找
            project = db.session.query(ProjectDataModel).filter_by(id=item_id, status=1).first()
            if project:
                result[item_id] = {"type": "project", "name": project.project_nm, "path": f"/projects/{item_id}"}
                continue
            func = db.session.query(FunctionDataModel).filter_by(id=item_id, status=1).first()
            if func:
                result[item_id] = {"type": "function", "name": func.function_nm, "path": f"/projects/{func.project_id}"}
                continue
            duty = db.session.query(TemporaryDutyModel).filter_by(id=item_id, status=1).first()
            if duty:
                result[item_id] = {"type": "duty", "name": duty.duty_nm, "path": f"/duties/{item_id}"}
                continue
        return result
