# -*- coding: utf-8 -*-
"""
@文件: write_log.py
@說明: 記錄日誌
@時間: 2023/09/19 10:45:43
@作者: LiDong
"""
import logging
import os
from logging.handlers import TimedRotatingFileHandler

from configs.log_conf import log_conf


class WriteLog:
    def __init__(self, log_name, log_dir, log_fmt, level, DEBUG=False) -> None:
        self.log_dir = log_dir
        self.DEBUG = DEBUG
        self.log_fmt = log_fmt
        self.logger = self.create_logger(log_name, level)

    def __create_dir(self, path):
        if not os.path.exists(path):
            os.mkdir(path)

    def init_log(self, filename, level):
        handler = TimedRotatingFileHandler(
            filename=filename,
            when="D",
            interval=1,
            backupCount=7,
            encoding="utf-8"
        )
        handler.setLevel(level)
        handler_fmt = logging.Formatter(self.log_fmt)
        handler.setFormatter(handler_fmt)

        return handler

    def __setup(self, logger, _path, level):
        dir_path = os.path.join(self.log_dir, _path)
        self.__create_dir(dir_path)
        file_path = os.path.join(dir_path, f"{_path}.log")
        fh = self.init_log(file_path, level)
        logger.addHandler(fh)

    def create_logger(self, appname, level):
        logger = logging.getLogger(appname)
        logger.setLevel(level)
        _dirs = {
            "info": logging.INFO,
            "warn": logging.WARN,
            "error": logging.ERROR,
            "critical": logging.CRITICAL
        }
        for k, v in _dirs.items():
            self.__setup(logger, k, v)
        if self.DEBUG:
            self.__setup(logger, "debug", logging.DEBUG)

        return logger


def enable_log(word, debug=False):
    conf = log_conf[word]
    log_dir = conf.get("PATH", "logs")
    log_name = conf.get("LOG_NAME", "app")
    log_fmt = conf.get("LOG_FMT")
    level = logging.INFO
    logger = WriteLog(
        log_name=log_name,
        log_dir=log_dir,
        level=level,
        log_fmt=log_fmt,
        DEBUG=debug
    )

    return logger.logger
