from apps.user_app.models import (OperFunctionDataModel, OperProjectDataModel,
                                  OperTempDutyModel)


class UserStatisticalController:
    def __init__(self) -> None:
        self.OPPDM = OperProjectDataModel()
        self.OPTDM = OperTempDutyModel()
        self.OPFDM = OperFunctionDataModel()

    def __get_doing_project_num(self, empid, result_dict):
        doing_dev_pids = self.OPFDM.query_dev_pid_by_emp(empid)
        doing_project_num = self.OPPDM.query_project_num_by_status(
            empid, [1, 2, 3, 4, 5, 6], doing_dev_pids
        )
        result_dict["doing_project_num"] = doing_project_num

    def __get_finished_project_num(self, empid, result_dict):
        # finished_dev_pids = self.OPFDM.query_dev_pid_by_emp(empid, [3])
        finished_project_num = self.OPPDM.query_project_num_by_status(
            empid, [7], list()
        )
        result_dict["finished_project_num"] = finished_project_num

    def __get_duty_num(self, empid, result_dict):
        doing_duty_num = self.OPTDM.query_task_num_by_emp_n_status(empid, 2)
        finished_duty_num = self.OPTDM.query_task_num_by_emp_n_status(empid, 3)
        unstart_duty_num = self.OPTDM.query_task_num_by_emp_n_status(empid, 1)
        result_dict["doing_duty_num"] = doing_duty_num
        result_dict["finished_duty_num"] = finished_duty_num
        result_dict["unstart_duty_num"] = unstart_duty_num

    def query_user_statistical(self, empid):
        result_dict = {}
        self.__get_doing_project_num(empid, result_dict)
        self.__get_finished_project_num(empid, result_dict)
        self.__get_duty_num(empid, result_dict)

        return result_dict
