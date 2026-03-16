# -*- coding: utf-8 -*-
"""
@文件: common_method.py
@說明: API響應方法
@時間: 2023/10/19 14:15:34
@作者: LiDong
"""


def response_data_result(content="", msg="成功", code="S10000"):
    """"""
    rsp_dict = {}
    rsp_dict["code"] = code
    rsp_dict["msg"] = msg
    rsp_dict["content"] = content
    return rsp_dict


def fail_response_result(content="", msg="", code="F10001"):
    """"""
    rsp_dict = {}
    rsp_dict["code"] = code
    rsp_dict["msg"] = "失敗，" + msg
    rsp_dict["content"] = content
    return rsp_dict
