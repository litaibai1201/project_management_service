from common.common_tools import CommonTools
from configs.senddingplus import SendMessageNotice
from scheduled_tasks.models import OperFunctionDataModel, OperProjectDataModel
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProjectDataModelSchema)


def __handle_pro_data(pro_list, fun_list):
    data_dict = {}
    for pdata in pro_list:
        if pdata["status"] == 5:
            for fun in fun_list:
                if fun["project_id"] == pdata["id"]:
                    fun_copy = fun.copy()
                    fun_copy.pop("project_id")
                    if pdata["id"] not in data_dict:
                        data_dict[pdata["id"]] = [fun_copy]
                    else:
                        data_dict[pdata["id"]].append(fun_copy)
    return data_dict


def __generate_task_status(fun, date):
    if fun["updated_at"]:
        updated_at = fun["updated_at"].split(" ")[0]
        if updated_at == date and fun["progress"] == 100:
            # color = "#008000" if date <= fun["expected_end_date"] else "#FF0000"
            return f"  \n\n  <font color='#008000'>{fun['function_nm']} 任务已完成。</font>"
        elif fun["progress"] != 100:
            color = "#FF0000" if date > fun["expected_end_date"] else "#36bf36"
            return f"  \n\n  <font color={color}>{fun['function_nm']} 任务开发进度为{fun['progress']}%。</font>"
    else:
        if fun["progress"] == 0:
            if fun["expected_end_date"]:
                color = "#FF0000" if date > fun["expected_end_date"] else "#ef9b87"
                return f"  \n\n  <font color={color}>{fun['function_nm']} 任务尚未开始。</font>"
            else:
                return f"  \n\n  <font color='#ef9b87'>{fun['function_nm']} 任务尚未开始。</font>"
        elif 0 < fun["progress"] < 100:
            if fun["expected_end_date"]:
                return f"  \n\n  <font color='#36bf36'>{fun['function_nm']} 任务开发进度为{fun['progress']}%。</font>"
            else:
                return f"  \n\n  <font color='#36bf36'>{fun['function_nm']} 任务开发进度为{fun['progress']}%。</font>"
    return ""


def __summary_fun_progress(pro, data_dict, date):
    fun_data = data_dict.get(pro["id"], [])
    content = ""

    for fun in fun_data:
        task_status = __generate_task_status(fun, date)
        if task_status:
            content += task_status

    return content


def __notice_pro_progress_to_leader(pro_list, data_dict, date):
    user_ids = ["12390105", "L2300045", "A2440333"]
    message = "副理，您好！以下为專案進度匯總："
    for index, pro in enumerate(pro_list, start=1):
        if pro["status"] == 1:
            message += (
                f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於待上傳資料中。"
            )
        elif pro["status"] == 2:
            message += f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於專案審核中。"
        elif pro["status"] == 3:
            message += f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於架構規劃中。"
        elif pro["status"] == 4:
            message += f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於架構審核中。"
        elif pro["status"] == 5:
            content = __summary_fun_progress(pro, data_dict, date)
            message += (
                f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於開發中： \n\n  "
                f"{content}"
            )
        elif pro["status"] == 6:
            message += f"  \n\n  {index}、 **{pro['project_nm']}** 專案處於完結審核中。"
        elif pro["status"] == 7:
            message += f"  \n\n  {index}、 **{pro['project_nm']}** 專案已完結。"
    SendMessageNotice.send_single_markdown(message, user_ids)


def notice_leader_main():
    opdm = OperProjectDataModel()
    ofdm = OperFunctionDataModel()
    fdms = FunctionDataModelSchema(
        only=[
            "function_nm",
            "project_id",
            "progress",
            "updated_at",
            "expected_end_date",
        ],
        many=True,
    )
    pdms = ProjectDataModelSchema(many=True)
    date = CommonTools.get_now("date")
    pro_list = opdm.get_pro_data()
    pid_list = [pro.id for pro in pro_list]
    fun_list = ofdm.get_fun_data(pid_list)
    fun_list = fdms.dump(fun_list)
    pro_list = pdms.dump(pro_list)
    data_dict = __handle_pro_data(pro_list, fun_list)
    __notice_pro_progress_to_leader(pro_list, data_dict, date)
