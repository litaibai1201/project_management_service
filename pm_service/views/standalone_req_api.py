# -*- coding: utf-8 -*-
"""独立需求接口 Blueprint"""
from flask import request, send_file
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.standalone_req_controller import StandaloneReqController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp = Blueprint("standalone_req_api", __name__, description="独立需求管理接口")
ctrl = StandaloneReqController()


@blp.route("/list")
class ReqListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """需求列表"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.list_reqs(payload, work_no=work_no))


@blp.route("/create")
class ReqCreateApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """创建需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.create_req(payload, creator=work_no))


@blp.route("/<string:req_id>")
class ReqDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, req_id):
        """获取需求详情"""
        from dbs.mysql_db import db
        from dbs.mysql_db.model_tables import StandaloneReqModel
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(resource_type="需求")
        return response_result(content=r.to_dict())

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, req_id):
        """更新需求"""
        work_no = get_identity()
        payload = request.get_json() or {}
        return response_result(content=ctrl.update_req(req_id, payload, work_no))

    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def delete(self, req_id):
        """删除需求"""
        work_no = get_identity()
        return response_result(content=ctrl.delete_req(req_id, work_no))


@blp.route("/<string:req_id>/files")
class ReqFilesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, req_id):
        """获取需求附件列表"""
        from dbs.mysql_db import db
        from dbs.mysql_db.model_tables import StandaloneReqModel
        import json
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        files = []
        if r and r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        return response_result(content=files)

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self, req_id):
        """上传需求附件"""
        work_no = get_identity()
        file = request.files.get("file")
        if not file or not file.filename:
            from utils.exceptions import ValidationException
            raise ValidationException(msg="未选择文件")
        return response_result(content=ctrl.upload_file(req_id, file, uploader=work_no))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, req_id):
        """删除需求附件"""
        work_no = get_identity()
        file_id = (request.get_json() or {}).get("file_id", "")
        return response_result(content=ctrl.remove_file(req_id, file_id))


@blp.route("/<string:req_id>/files/<string:file_id>/preview")
class ReqFilePreviewApi(MethodView):
    @jwt_required()
    def get(self, req_id, file_id):
        """预览需求附件"""
        import mimetypes
        abs_path, original_name = ctrl.get_file_path(req_id, file_id)
        mime_type, _ = mimetypes.guess_type(original_name)
        mime_type = mime_type or "application/octet-stream"
        return send_file(abs_path, mimetype=mime_type, as_attachment=False, download_name=original_name)


@blp.route("/<string:req_id>/files/<string:file_id>/download")
class ReqFileDownloadApi(MethodView):
    @jwt_required()
    def get(self, req_id, file_id):
        """下载需求附件"""
        abs_path, original_name = ctrl.get_file_path(req_id, file_id)
        return send_file(abs_path, as_attachment=True, download_name=original_name)
