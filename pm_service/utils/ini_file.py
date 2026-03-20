# -*- coding: utf-8 -*-
"""
@File    :   ini_file.py
@Time    :   2025-02-12 17:10:40
@Version :   1.0
@Desc    :   INI配置文件读取工具
"""
import configparser
from loggers import logger
from pathlib import Path
from typing import Any, Dict, Optional


class IniConfigReaderMethod:
    def __init__(self, config_file: str):
        """
        初始化配置讀取器

        Args:
            config_file: INI配置文件的路径
        """
        self.config_file = config_file
        self.config = configparser.ConfigParser()
        self.read_config()

    def read_config(self) -> bool:
        """
        讀取配置文件

        Returns:
            bool: 是否成功讀取配置
        """
        try:
            file_pure = Path(self.config_file)
            ini_file = str(file_pure)
            if not file_pure.exists():
                logger.error(
                    "配置文件不存在",
                    category="error",
                    event="ini_not_found",
                    custom={"file": ini_file}
                )
                return False
            files_read = self.config.read(ini_file, encoding="utf-8-sig")
            if not files_read:
                logger.error(
                    "无法读取配置文件",
                    category="error",
                    event="ini_read_failed",
                    custom={"file": ini_file}
                )
                return False

            logger.info(
                "成功读取配置文件",
                category="business",
                event="ini_read_success",
                custom={"file": str(file_pure.name), "path": ini_file}
            )
            return True

        except configparser.Error as e:
            logger.error(
                "解析配置文件出错",
                category="error",
                event="ini_parse_error",
                error=e,
                custom={"file": ini_file}
            )
            return False

    def get_value(self, section: str, key: str, default: Any = "") -> Any:
        """
        获取配置值

        Args:
            section: 节名
            key: 键名
            default: 默認值

        Returns:
            配置值或默認值
        """
        try:
            value = self.config.get(section, key)
            logger.debug(
                "读取配置项",
                event="ini_get",
                custom={"section": section, "key": key, "value": value}
            )
            return value
        except (configparser.NoSectionError, configparser.NoOptionError):
            logger.warning(
                "配置项不存在，使用默认值",
                category="validation",
                event="ini_missing",
                custom={"section": section, "key": key, "default": default}
            )
            return default

    def get_int(
        self, section: str, key: str, default: Optional[int] = None
    ) -> Optional[int]:
        """获取整数值"""
        try:
            return self.config.getint(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError):
            logger.warning(
                "无法读取整数配置，使用默认值",
                category="validation",
                event="ini_getint_failed",
                custom={"section": section, "key": key, "default": default}
            )
            return default

    def get_float(
        self, section: str, key: str, default: Optional[float] = None
    ) -> Optional[float]:
        """获取浮点数值"""
        try:
            return self.config.getfloat(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError):
            logger.warning(
                "无法读取浮点数配置，使用默认值",
                category="validation",
                event="ini_getfloat_failed",
                custom={"section": section, "key": key, "default": default}
            )
            return default

    def get_boolean(
        self, section: str, key: str, default: Optional[bool] = None
    ) -> Optional[bool]:
        """获取布尔值"""
        try:
            return self.config.getboolean(section, key)
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError):
            logger.warning(
                "无法读取布尔值配置，使用默认值",
                category="validation",
                event="ini_getboolean_failed",
                custom={"section": section, "key": key, "default": default}
            )
            return default

    def get_section(self, section: str) -> Dict[str, str]:
        """获取整个节的内容"""
        try:
            section_dict = dict(self.config[section])
            logger.debug(
                "读取配置节",
                event="ini_get_section",
                custom={"section": section, "content": section_dict}
            )
            return section_dict
        except KeyError:
            logger.warning(
                "配置节不存在",
                category="validation",
                event="ini_section_missing",
                custom={"section": section}
            )
            return {}

    def list_sections(self) -> list:
        """获取所有节名"""
        sections = self.config.sections()
        logger.debug(
            "获取所有配置节",
            event="ini_list_sections",
            custom={"sections": sections}
        )
        return sections
