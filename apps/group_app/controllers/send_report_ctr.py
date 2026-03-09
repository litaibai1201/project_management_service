# -*- coding: utf-8 -*-
'''
@文件: send_report_ctr.py
@說明:
@時間: 2024/11/08 16:55:26
@作者: LiDong
'''

import os
from functools import cached_property

import requests
from flask import current_app as app

from common.common_docx import AdvancedWordTableGenerator
from common.common_mongo import MongoDBHandler
from common.common_tools import CommonTools, TryExcept
from configs.constant import MONGO_CONFIG, REPORT_DIR
from configs.db_config import db_config_dict


class SendReportController:

    @cached_property
    def mongo(self):
        mongodb = db_config_dict["mongodb"]
        host = mongodb["host"]
        port = mongodb["port"]
        db_name = mongodb["database_name"]
        mongo = MongoDBHandler(
            connection_string=f"mongodb://{host}:{port}/",
            db_name=db_name,
            logger=app.logger
        )
        return mongo

    def __format_headers(self, work_no, username, payload):
        start_date = payload.get("start_date", "").replace("-", "/")
        end_date = payload.get("end_date", "").replace("-", "/")
        if start_date == end_date:
            date_str = end_date.replace("-", "/")
        else:
            date_str = f"{start_date}-{end_date}"
        headers = [
            (f"工號: {work_no}", f"記錄人姓名: {username}"),
            ("日期(西元)", date_str),
            ("項目(第幾項、項目名稱)", "內容")
        ]
        return headers

    def __save_report_to_doc(self, generator, username, dep_nm):
        today_str = CommonTools.get_now("date_nums")
        _file_nm = f"{username}_日報_{today_str}.docx"
        _path = os.path.join(
            REPORT_DIR,
            f"{dep_nm}/{today_str[:4]}/{today_str[4:6]}/{today_str[6:]}"
        )
        if not os.path.exists(_path):
            os.makedirs(_path)
        _path = os.path.join(_path, _file_nm)
        generator.save(_path)
        return _path

    def __send_file(self, file_path):
        url = "http://10.126.1.238:17651/api/sendGroupAlarmFile"
        file_name = file_path.replace("\\", "/").split("/")[-1]
        with open(file_path, "rb") as file:
            filedata = file.read()
            files = {"file": (file_name, filedata, "text/plain")}
        data = {
            "groupid": "ciduCsppoqkURwKeLQHquZWLQ==",
            "type": "file",
            "same_alarm_inter": 5,
            "service_name": "專案管理系統消息通知",
            "service_type": "Web",
            "token": "dc3e4acc812d36222751d4b6224131f642756219333996a25e165e882ba7bc02"
        }
        res = requests.post(url=url, data=data, files=files)
        code = res.json()
        return code

    def __save_data_in_mongo(self, payload, work_no):
        start_date = payload.pop("start_date", "")
        end_date = payload.pop("end_date", "")
        if start_date != end_date:
            return
        payload["date"] = end_date
        payload["work_no"] = work_no
        collection = MONGO_CONFIG["COLLECTION"]
        data = self.mongo.find_one(collection, {
            "work_no": work_no,
            "date": end_date
        })
        if not data:
            _id = self.mongo.insert_one(collection, payload)
            app.logger.info(f"日報數據存入mongo成功: {_id}")
        else:
            _id = data["_id"]
            self.mongo.update_by_id(collection, _id, {
                "$set": {"content": payload["content"]}
            })
            app.logger.info(f"日報數據已存在, 已更新content: {_id}")

    @TryExcept("日報發送失敗")
    def save_report_to_doc(self, payload, work_no):
        dep_nm = payload.get("dep_nm", "")
        title = f"部門名稱: {dep_nm}"
        username = payload.get("username", "")
        self.__save_data_in_mongo(payload, work_no)
        headers = self.__format_headers(work_no, username, payload)
        datalist = []
        for prog in payload.get("content", list()):
            total_time_consum = prog.get('total_time_consum', 0)
            project_nm = prog.get('project_nm', '')
            project_nm = f"{project_nm}\n總耗時: {total_time_consum}h"
            datalist.append((project_nm, prog.get("function_list", list())))
        generator = AdvancedWordTableGenerator()
        generator.run(headers, title, datalist)
        _path = self.__save_report_to_doc(generator, username, dep_nm)
        return _path
        # result = self.__send_file(_path)
        # if result.get("code", "F10001") == "S10000":
        #     return "日報發送成功"
        # return "日報發送失敗"
