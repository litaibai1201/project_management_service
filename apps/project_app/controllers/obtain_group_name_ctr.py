from apps.project_app.models import OperProjectGroupModel, OperFunctionDataModel
from serialize.model_serizlize import FunctionDataModelSchema, ProjectGroupModelSchema


class ObtainPojectGroupController:
    def __init__(self) -> None:
        self.opgm = OperProjectGroupModel()
        self.pgms = ProjectGroupModelSchema(only=["id", "group_name"], many=True)

    def obtain_project_group(self):
        group_data = self.opgm.obtain_project_group_data()
        group_data = self.pgms.dump(group_data)
        return group_data


class ObtainFunctionGroupController:
    def __init__(self) -> None:
        self.ofdm = OperFunctionDataModel()
        self.fdms = FunctionDataModelSchema(only=["group1", "group2"], many=True)

    def obtain_function_group(self, project_id):
        function_data = self.ofdm.search_data_by_pid(project_id)
        group_data = self.fdms.dump(function_data)
        data_dict = {}
        for data in group_data:
            if data["group1"] not in data_dict.keys():
                data_dict[data["group1"]] = []
            if data["group2"] and data["group2"] not in data_dict[data["group1"]]:
                data_dict[data["group1"]].append(data["group2"])
        return data_dict
