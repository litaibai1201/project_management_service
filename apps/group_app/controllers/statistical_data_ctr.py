# -*- coding: utf-8 -*-
'''
@文件: statistical_data_ctr.py
@說明:
@時間: 2024/12/30 14:53:30
@作者: LiDong
'''
from apps.group_app.models import OperFunctionDataModel


class StatisticalDataController:
    def run(self, payload, empid):
        ofdm = OperFunctionDataModel()
        return ofdm.calculate_statistics(empid, payload)
