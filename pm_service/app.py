# -*- coding: utf-8 -*-
"""
@文件: app.py
@說明: server啟動文件
@時間: 2023/10/19 19:09:13
@作者: LiDong
"""
import json
import os
from datetime import timedelta

from flask import Flask, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_marshmallow import Marshmallow
from flask_migrate import Migrate
from flask_smorest import Api

from cache import redis_client
from common.common_method import fail_response_result
from configs.app_config import REDIS_DATABASE_URI, SQLALCHEMY_DATABASE_URI
from dbs.mysql_db import db
from loggers import logger
from urls.views import register_blp

# from waitress import serve
app = Flask(__name__)
jwt = JWTManager(app)


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return fail_response_result(msg="Token is expired", code=401)


@jwt.invalid_token_loader
def invalid_token_callback(error):
    return fail_response_result(msg="Token is invalid", code=401)


@jwt.unauthorized_loader
def missing_token_callback(error):
    return fail_response_result(msg="Missing Authentication Token", code=401)


@app.after_request
def after_request(resp):
    if request.method == "OPTIONS":
        return resp
    try:
        data = json.loads(resp.data)
        if data.get("code", 200) == 422:
            for value in data.get("errors").get("json").values():
                if isinstance(value, list):
                    resp.data = json.dumps(
                        fail_response_result(msg=value[0]),
                        ensure_ascii=False,
                    )
                else:
                    for val in value.values():
                        resp.data = json.dumps(
                            fail_response_result(msg=val[0]),
                            ensure_ascii=False,
                        )
    except Exception:
        pass
    return resp


def create_app():

    CORS(app, supports_credentials=True)
    app.config["Access-Control-Allow-Origin"] = "*"
    app.config["API_TITLE"] = "ALARM SERVER REST API"
    app.config["API_VERSION"] = "v1"
    app.config["OPENAPI_VERSION"] = "3.0.3"
    app.config["OPENAPI_URL_PREFIX"] = "/"
    app.config["OPENAPI_SWAGGER_UI_PATH"] = "/swagger-ui"
    app.config["OPENAPI_SWAGGER_UI_URL"] = (
        "https://cdn.jsdelivr.net/npm/swagger-ui-dist/"
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ECHO"] = False
    app.config["REDIS_URL"] = REDIS_DATABASE_URI
    app.config["REDIS_RESPONSE"] = True
    app.config["PROPAGATE_EXCEPTIONS"] = True
    app.config["JSON_AS_ASCII"] = False
    app.config["CORS_HEADERS"] = "Content-Type"
    app.config["KEEP_ALIVE"] = False
    app.config["JWT_ALGORITHM"] = "HS256"
    app.config["JWT_SECRET_KEY"] = "Avary88!"
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(weeks=4)
    app.logger = logger
    migrate = Migrate()
    migrate.init_app(app)
    db.init_app(app)
    with app.app_context():
        db.create_all()
    redis_client.init_app(app)
    marsh = Marshmallow()
    marsh.init_app(app)
    api = Api(app)
    register_blp(api)

    return app


if __name__ == "__main__":
    app = create_app()
    with open("./pid", "w") as f:
        pid = str(os.getpid())
        f.write(pid)
    print("===================server starting============================")
    # app.run("0.0.0.0", 19999, debug=True, use_reloader=False)
    app.run("0.0.0.0", 19999, debug=True)
