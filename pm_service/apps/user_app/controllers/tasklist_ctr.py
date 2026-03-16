# -*- coding: utf-8 -*-
"""
@文件: tasklist_controller.py
@說明:
@時間: 2024/03/06 16:02:06
@作者: LiDong
"""

# from apps.user_app.models import OperFunctionDataModel, OperProjectDataModel
# from apps.user_app.serializes import FunctionDataSchema, ProjectDataSchema
# from common.common_minio import OperMinio


# class UserTaskListController:
#     def __init__(self) -> None:
#         self.OPPM = OperProjectDataModel()
#         self.OPFM = OperFunctionDataModel()
#         self.OpMinio = OperMinio()
#         self.ProjectSchema = ProjectDataSchema()
#         self.FunctionSchema = FunctionDataSchema()

#     def __get_project_data(self, empid):
#         project_all_data = self.OPPM.search_data()
#         result_project_datas = []
#         for pdata in project_all_data:
#             pdata_ser = self.ProjectSchema.dump(pdata)
#             devs = pdata_ser.get("developers", "")
#             if devs and list(filter(lambda x: x.strip() == empid, devs.split(";"))):
#                 result_project = {"task_list": []}
#                 result_project["project_nm"] = pdata_ser.get("project_nm", "")
#                 result_project["project_id"] = pdata_ser.get("id", "")
#                 result_project_datas.append(result_project)
#         return result_project_datas

#     def __combine_result_datas(self, result_task, fm_data_ser):
#         result_task["function_id"] = fm_data_ser.get("id", "")
#         params = [
#             "project_id",
#             "function_nm",
#             "expected_start_date",
#             "expected_end_date",
#             "priority",
#             "progress",
#         ]
#         for param in params:
#             result_task[param] = fm_data_ser.get(f"{param}", "")
#         semicolon_params = ["files", "images", "videos", "developers"]
#         for param in semicolon_params:
#             value = fm_data_ser.get(f"{param}", "")
#             result_task[param] = value.split(";") if value else ""

#     def __get_task_data(self, empid, status, project_list):
#         user_pids = [d["project_id"] for d in project_list]
#         fm_datas = self.OPFM.search_data_by_pids_n_status(user_pids, status)
#         result_task_datas = []
#         for fdata in fm_datas:
#             fm_data_ser = self.FunctionSchema.dump(fdata)
#             devs = fm_data_ser.get("developers", "")
#             if devs and list(filter(lambda x: x.strip() == empid, devs.split(";"))):
#                 result_task = {}
#                 self.__combine_result_datas(result_task, fm_data_ser)
#                 result_task_datas.append(result_task)
#         return result_task_datas

#     def __combine_project_n_task(self, result_dict, project_dicts, task_dicts):
#         for project in project_dicts:
#             new_task_dicts = []
#             for task in task_dicts:
#                 if task["project_id"] == project["project_id"]:
#                     project["task_list"].append(task)
#                 else:
#                     new_task_dicts.append(task)
#             task_dicts = new_task_dicts
#             project["task_num"] = len(project["task_list"])
#         result_dict["project_list"] = project_dicts

#     def query_user_task_data(self, empid, status):
#         result_dict = {}
#         project_dicts = self.__get_project_data(empid)
#         task_dicts = self.__get_task_data(empid, status, project_dicts)
#         self.__combine_project_n_task(result_dict, project_dicts, task_dicts)
#         result_dict["total_task_num"] = len(task_dicts)
#         return result_dict
