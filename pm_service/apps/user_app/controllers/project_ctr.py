import math

from apps.project_app.models import OperProjectGroupModel
from apps.user_app.models import OperFunctionDataModel, OperProjectDataModel
from serialize.model_serizlize import ProjectGroupModelSchema


class UserProjectController:
    def __init__(self) -> None:
        self.OPPDM = OperProjectDataModel()
        self.OPFDM = OperFunctionDataModel()
        self.OPGM = OperProjectGroupModel()

    def __get_params(self, payload):
        status = payload.get("status", 1)
        size = payload.get("size", 5)
        status_list = [status]
        if status in [1, 3, 5]:
            status_list = [1, 3, 5]
        elif status in [2, 4, 6]:
            status_list = [2, 4, 6]
        return status_list, size

    def __get_function_num(self, project_info):
        project_id = project_info.get("project_id", "")
        if not project_id:
            return False
        progress_n_status_list = self.OPFDM.query_progress_n_status_by_pid(project_id)
        project_info["doing_function_num"] = 0
        project_info["finished_function_num"] = 0
        project_info["function_num"] = 0
        for data in progress_n_status_list:
            status = data[1]
            if status == 0 or status == 4:
                continue
            if status == 2:
                project_info["doing_function_num"] += 1
            elif status == 3:
                project_info["finished_function_num"] += 1
            project_info["function_num"] += 1
        return True

    def __extract_projects_info(self, projects):
        project_info_list = []
        group_data = self.OPGM.obtain_project_group_data()
        group_dict = {data[0]: data[1] for data in group_data}
        for project in projects:
            group_name = group_dict.get(project.group_id, "")
            project_info = {
                "group_id": project.group_id,
                "group_name": group_name,
                "project_id": project.id,
                "project_nm": project.project_nm,
                "product_pm": project.product_pm,
            }
            if not self.__get_function_num(project_info):
                continue
            project_info_list.append(project_info)
        return project_info_list

    def query_user_project_data(self, empid, payload):
        status_list, size = self.__get_params(payload)
        dev_pids = self.OPFDM.query_dev_pid_by_emp(empid)
        projects = self.OPPDM.query_project(empid, status_list, size, dev_pids)
        return self.__extract_projects_info(projects)
