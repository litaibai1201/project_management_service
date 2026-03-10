# -*- coding: utf-8 -*-
"""
@文件: common_tools.py
@說明: 公共方法模塊
@時間: 2023/10/19 14:14:33
@作者: LiDong
"""

import datetime
import random
import time
import traceback
from functools import wraps

import requests
from flask import current_app as app
from sqlalchemy import func, literal


def member_match(column, empid):
    """
    精確匹配分號分隔的多值字段中的某個成員。
    等價 SQL: FIND_IN_SET(:empid, REPLACE(column, ';', ',')) > 0
    避免 .contains() 產生的子串誤匹配（如 '123' 命中 '1234'）。
    """
    return func.find_in_set(literal(empid), func.replace(column, ";", ",")) > 0


def timeit(func):
    """装饰器：统计函数执行时间"""

    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        elapsed_time = end_time - start_time
        print(f"Function '{func.__name__}' executed in {elapsed_time:.4f} seconds")
        return result

    return wrapper


def get_timestamp():
    ts = str(int(datetime.datetime.now().timestamp() * 1000))
    suffix = str(random.randint(100, 999))
    return ts + suffix


def get_now(data=None, days=0):
    """
    獲取時間字符
    """

    now_time = datetime.datetime.now() + datetime.timedelta(days=days)
    if data == "date":
        return now_time.strftime("%Y-%m-%d")
    elif data == "time":
        return now_time.strftime("%H:%M:%S")
    elif data == "datetime":
        return now_time
    elif data == "datetime_nums":
        return now_time.strftime("%Y%m%d%H%M%S")
    elif data == "date_nums":
        return now_time.strftime("%Y%m%d")
    else:
        return now_time.strftime("%Y-%m-%d %H:%M:%S")


def extract_req_files(files):
    files_dict = {}
    for key in files:
        files_dict[key] = files.getlist(key)
    return files_dict


class TryExcept:
    def __init__(self, default_error=""):
        self.default_error = default_error
        self.errors = (Exception,)

    def __call__(self, func):
        def inner(*args, **kwargs):
            try:
                return func(*args, **kwargs), True
            except self.errors:
                app.logger.error(f"{args}: {self.default_error}")
                app.logger.error(traceback.format_exc())
                return self.default_error, False

        return inner


class CommonTools:

    @TryExcept("請求失敗")
    @staticmethod
    def send_get_request(url, data):
        res = requests.get(url, params=data, timeout=30)
        result = res.json()
        return result

    @TryExcept("請求失敗")
    @staticmethod
    def send_post_request(url, data):
        res = requests.post(url, json=data, timeout=30)
        result = res.json()
        return result

    @staticmethod
    def get_total_page(count, total_count):
        total_page = int(total_count / count)
        if total_count / count > total_page:
            total_page += 1
        return total_page

    @staticmethod
    def extract_req_files(files):
        files_dict = {}
        for key in files:
            files_dict[key] = files.getlist(key)
        return files_dict

    @staticmethod
    def get_timestamp():
        ts = str(int(datetime.datetime.now().timestamp() * 1000))
        suffix = str(random.randint(100, 999))
        return ts + suffix

    @staticmethod
    def get_now(data=None, days=0):
        """
        獲取時間字符
        """

        now_time = datetime.datetime.now() + datetime.timedelta(days=days)
        if data == "date":
            return now_time.strftime("%Y-%m-%d")
        elif data == "time":
            return now_time.strftime("%H:%M:%S")
        elif data == "datetime":
            return now_time
        elif data == "datetime_nums":
            return now_time.strftime("%Y%m%d%H%M%S")
        elif data == "date_nums":
            return now_time.strftime("%Y%m%d")
        else:
            return now_time.strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def convert_file_info_to_dict(file_info):
        file_info_dic = {}
        for info in file_info:
            last_folder = info.get("last_folder")
            if last_folder not in file_info_dic:
                file_info_dic[last_folder] = []
            file_info_dic[last_folder].append(
                {
                    "file_url": info.get("file_url"),
                    "file_name": info.get("file_name"),
                    "file_ext": info.get("file_ext"),
                    "created_at": info.get("created_at"),
                    "size": info.get("size"),
                }
            )
        return file_info_dic

    @staticmethod
    def generate_date_list(start_date_str, end_date_str, date_format="%Y-%m-%d"):
        """生成两个日期之间的所有日期列表"""
        start_date = datetime.datetime.strptime(
            start_date_str, date_format).date()
        end_date = datetime.datetime.strptime(end_date_str, date_format).date()
        date_list = []
        current_date = start_date
        while current_date <= end_date:
            date_list.append(current_date.strftime(date_format))
            current_date += datetime.timedelta(days=1)
        return date_list
