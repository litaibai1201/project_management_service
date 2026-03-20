# -*- coding: utf-8 -*-
"""
@文件: common_tools.py
@說明: 公共方法模塊（通用，不依赖特定框架）
@時間: 2023/10/19 14:14:33
"""
import os
import time
from datetime import datetime, timedelta

import requests
import yaml


from loggers import logger


def get_time(f):
    """函数执行耗时装饰器"""
    def inner(*arg, **kwarg):
        s_time = time.time()
        res = f(*arg, **kwarg)
        e_time = time.time()
        print("耗时：{}秒，函式：{}".format(round(e_time - s_time, 3), f))
        return res

    return inner


class ReadConf:
    """YAML 配置文件读取"""
    def __init__(self, yaml_file):
        self.yaml_file = yaml_file

    def read_yaml(self):
        with open(self.yaml_file, encoding='utf-8') as f:
            value = yaml.load(f, Loader=yaml.FullLoader)
            return value


class TryExcept:
    """
    异常捕获装饰器 - 通用实现，可用于任何 Python 项目

    功能：
    - 捕获异常并记录日志 + traceback
    - 返回 (default_error, False) 供调用方检测
    - 支持 raise_on_error 模式，将异常包装后重抛

    使用示例：
        # 基础用法（返回值判断）
        @TryExcept("请求失败")
        def send_request(url):
            return requests.get(url).json()

        result, ok = send_request("https://...")
        if not ok:
            print(result)  # 打印错误信息

        # 异常驱动用法
        @TryExcept("请求失败", raise_on_error=True, exception_cls=MyException)
        def send_request_v2(url):
            return requests.get(url).json()

        try:
            result = send_request_v2("https://...")
        except MyException as e:
            print(e)
    """

    def __init__(self, default_error="", raise_on_error=False, exception_cls=None):
        """
        Args:
            default_error: 捕获异常时返回的默认错误信息
            raise_on_error: 是否在捕获异常后重新抛出
            exception_cls: raise_on_error=True 时要抛出的异常类，None 则原样重抛
        """
        self.default_error = default_error
        self.errors = (Exception,)
        self.raise_on_error = raise_on_error
        self.exception_cls = exception_cls

    def __call__(self, func):
        def inner(*args, **kwargs):
            try:
                return func(*args, **kwargs), True
            except self.errors as e:
                # 记录错误日志（使用项目统一的结构化日志格式）
                logger.error(
                    "捕获到异常",
                    category="error",
                    event=f"exception_in_{func.__name__}",
                    error=e,
                    custom={"func": func.__name__, "args": args, "default_error": self.default_error}
                )

                # 异常驱动模式：重新抛出异常
                if self.raise_on_error:
                    if self.exception_cls:
                        raise self.exception_cls(
                            msg=self.default_error,
                            content={"original_error": str(e)}
                        ) from e
                    else:
                        raise

                # 返回值判断模式（向后兼容）
                return self.default_error, False

        return inner


class CommonTools:
    # 从配置获取默认超时时间
    from configs.base import BaseConfig
    _default_timeout = BaseConfig.REQUEST_TIMEOUT

    @TryExcept("请求失败")
    @staticmethod
    def send_request(url, timeout=None):
        if timeout is None:
            timeout = CommonTools._default_timeout
        res = requests.get(url, timeout=timeout).json()
        if res.get("code", 400) == 200:
            return True
        return False

    @TryExcept("请求失败")
    @staticmethod
    def send_post_request(url, data, timeout=None):
        if timeout is None:
            timeout = CommonTools._default_timeout
        res = requests.post(url, json=data, timeout=timeout)
        result = res.json()
        if result.get("code") == "S10000":
            return True
        return False

    @staticmethod
    def get_now(data=None, days=0, seconds=0):
        """
        獲取時間字符
        """

        now_time = datetime.now() + timedelta(
            days=days, seconds=seconds
        )
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
    def get_timestmp():
        return int(time.time() * 1000)

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
            files_dict[key] = files.get(key)
        return files_dict

    @staticmethod
    def remove_file(folder_path):
        if not os.path.exists(folder_path):
            return
        files = os.listdir(folder_path)
        for file in files:
            file_path = os.path.join(folder_path, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
            elif os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                CommonTools.remove_file(file_path)
                os.removedirs(file_path)

    @staticmethod
    def time_trans(times):
        # 假设你已经有了一个带有UTC时区信息的datetime对象
        utc_time = times

        # 将UTC时间转换为北京时间（UTC+8）
        beijing_time = utc_time + timedelta(hours=8)
        return beijing_time.strftime("%Y-%m-%d %H:%M:%S")
