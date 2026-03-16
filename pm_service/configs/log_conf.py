# -*- coding: utf-8 -*-
"""
@文件: log_conf.py
@說明: log配置
@時間: 2023/10/19 19:03:57
@作者: LiDong
"""


log_conf = {
    "server": {
        "PATH": "logs",
        "LOG_NAME": "server",
        "LOG_FMT": "[%(asctime)s][%(filename)s][%(lineno)s][%(levelname)s][%(thread)d] - %(message)s",
    },
}
