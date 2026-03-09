from configs.senddingplus import SendMessageNotice
from configs.const_conf import ENV, send_message_link
from scheduled_tasks.models import (
    OperFunctionDataModel,
    OperProjectDataModel,
    OperTemporaryDutyModel,
)


def __notice_to_update_function_progress():
    opdm = OperProjectDataModel()
    ofdm = OperFunctionDataModel()
    pro_list = opdm.search_pro_data()
    pid_list = [pro.id for pro in pro_list]
    fun_list = ofdm.search_fun_data(pid_list)
    for pdata in pro_list:
        for fun in fun_list:
            if fun.project_id == pdata.id:
                link = f"{send_message_link[ENV]}projects/{pdata.id}"
                if fun.developers:
                    developers = fun.developers.split(";")
                    message = f"您好，請更新**{pdata.project_nm}**專案下{fun.function_nm}任務的進度，[点击查看]({link})。"
                    SendMessageNotice.send_single_markdown(message, developers)


def __notice_to_update_task_progress():
    otdm = OperTemporaryDutyModel()
    duty_data = otdm.search_duty_data()
    for duty in duty_data:
        link = f"{send_message_link[ENV]}task/{duty.id}"
        developers = duty.responsible.split(";")
        message = f"您好，請更新**{duty.duty_nm}**任務的進度，[点击查看]({link})。"
        SendMessageNotice.send_single_markdown(message, developers)


def notice_developers_main():
    __notice_to_update_function_progress()
    __notice_to_update_task_progress()
