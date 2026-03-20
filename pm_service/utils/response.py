# -*- coding: utf-8 -*-
"""
@文件: common_method.py
@說明: API響應方法
@時間: 2023/10/19 14:15:34
"""


def response_result(content=[], msg="OK", code="S10000"):
    """"""
    rsp_dict = {}
    rsp_dict["code"] = code
    rsp_dict["msg"] = msg
    rsp_dict["content"] = content
    return rsp_dict


def fail_response_result(content={}, msg="Error", code="F10001"):
    """"""
    rsp_dict = {}
    rsp_dict["code"] = code
    rsp_dict["msg"] = msg
    rsp_dict["content"] = content
    return rsp_dict
