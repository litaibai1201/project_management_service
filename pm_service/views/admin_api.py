# -*- coding: utf-8 -*-
"""管理接口 Blueprint — 仅管理员可用"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from utils.exceptions import PermissionException, ResourceNotFoundException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import ProjectGroupModel, UserRoleModel
from dbs.mysql_db.model_tables import generate_uuid
from serializes.response_serialize import RspMsgDictSchema

blp = Blueprint("admin_api", __name__, description="管理员接口")


def _require_admin():
    """检查当前用户是否为管理员，否则抛出权限异常"""
    work_no = get_identity()
    ur = db.session.query(UserRoleModel).filter_by(work_no=work_no).first()
    if not ur or ur.role_code != "admin":
        raise PermissionException(msg="仅管理员可执行此操作")


# ─── 专案分组管理 ─────────────────────────────────────────────────────────────

@blp.route("/project_group")
class ProjectGroupListApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取专案分组列表（所有登录用户可访问）"""
        groups = db.session.query(ProjectGroupModel).filter_by(status=1).all()
        return response_result(content=[
            {"id": g.id, "group_nm": g.group_nm}
            for g in groups
        ])

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """新建专案分组（仅管理员）"""
        _require_admin()
        payload = request.get_json() or {}
        group_nm = (payload.get("group_nm") or payload.get("group_name", "")).strip()
        if not group_nm:
            from utils.exceptions import ValidationException
            raise ValidationException(msg="分组名称不能为空")

        work_no = get_identity()
        g = ProjectGroupModel(
            id=generate_uuid(),
            group_nm=group_nm,
            creator=work_no,
        )
        db.session.add(g)
        db.session.commit()
        return response_result(content={"id": g.id, "group_nm": g.group_nm})


@blp.route("/project_group/<string:group_id>")
class ProjectGroupDetailApi(MethodView):

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, group_id):
        """更新专案分组（仅管理员）"""
        _require_admin()
        g = db.session.query(ProjectGroupModel).filter_by(id=group_id, status=1).first()
        if not g:
            raise ResourceNotFoundException(msg="分组不存在")

        payload = request.get_json() or {}
        group_nm = (payload.get("group_nm") or payload.get("group_name", "")).strip()
        if group_nm:
            g.group_nm = group_nm
        db.session.commit()
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, group_id):
        """删除专案分组（仅管理员）"""
        _require_admin()
        g = db.session.query(ProjectGroupModel).filter_by(id=group_id, status=1).first()
        if not g:
            raise ResourceNotFoundException(msg="分组不存在")
        g.status = 0
        db.session.commit()
        return response_result()
