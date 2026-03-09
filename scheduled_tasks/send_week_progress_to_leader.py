from common.common_tools import CommonTools
from configs.senddingplus import SendMessageNotice
from scheduled_tasks.send_daily_progress_to_leader import SummarizeDailyProgress


class SummarizeWeekProgress(SummarizeDailyProgress):
    def __init__(self) -> None:
        super().__init__()
        self.date = CommonTools.get_now("date")
        self.before_week_date = CommonTools.get_now("date", -5)
        self.next_week_date = CommonTools.get_now("date", 7)

    def __hadle_week_fun_data(self, pid_list, date, before_week_date):
        week_data_dict = {}
        for pid in pid_list:
            fun_list = self.ofdm.get_week_fun_data(pid, date, before_week_date)
            fun_list = self.fdms.dump(fun_list)
            self.obtain_fun_data_from_db(pid, week_data_dict, fun_list)
        return week_data_dict

    def __hadle_next_week_fun_data(self, pid_list, date, next_week_date):
        next_week_data_dict = {}
        for pid in pid_list:
            fun_list = self.ofdm.get_next_week_fun_data(pid, date, next_week_date)
            fun_list = self.fdms.dump(fun_list)
            self.obtain_fun_data_from_db(pid, next_week_data_dict, fun_list)
        return next_week_data_dict

    def __judage_is_send_message(
        self, pro_list, week_data_dict, next_week_data_dict, text
    ):
        week_message = ""
        next_week_message = ""
        if week_data_dict:
            message_prefix = (
                "<font color='#006400'>1、本週進度統計：\n\n </font>"
                if not text
                else "<font color='#006400'>2、本週進度統計：\n\n </font>"
            )
            week_message = self.notice_text_to_leader(
                pro_list, week_data_dict, message=message_prefix
            )
        if next_week_data_dict:
            if week_message:
                message_prefix = (
                    "<font color='#006400'>2、下週待完成的任務：\n\n </font>"
                    if not text
                    else "<font color='#006400'>3、下週待完成的任務：\n\n </font>"
                )
            else:
                message_prefix = (
                    "<font color='#006400'>1、下週待完成的任務：\n\n </font>"
                    if not text
                    else "<font color='#006400'>2、下週待完成的任務：\n\n </font>"
                )
            next_week_message = self.notice_text_to_leader(
                pro_list, next_week_data_dict, message=message_prefix
            )
        return week_message, next_week_message

    def __handle_complete_pro_data(self):
        text = ""
        complete_pro_data = self.opdm.get_complete_pro_data(
            self.date, self.before_week_date
        )
        if complete_pro_data:
            text = "<font color='#006400'>1、本週完成的專案：\n\n </font>"
            for index, pro_data in enumerate(complete_pro_data, start=1):
                text += f"{index}. {pro_data.project_nm} "
        return text

    def main(self):
        pro_list, pid_list = self.obtain_pro_data_from_db()
        text = self.__handle_complete_pro_data()
        if pid_list:
            week_data_dict = self.__hadle_week_fun_data(
                pid_list, self.date, self.before_week_date
            )
            next_week_data_dict = self.__hadle_next_week_fun_data(
                pid_list, self.date, self.next_week_date
            )
            week_message, next_week_message = self.__judage_is_send_message(
                pro_list, week_data_dict, next_week_data_dict, text
            )
        if week_message or next_week_message:
            content = f"副理，您好！以下为專案週進度匯總：\n\n {text} \n\n {week_message} \n\n {next_week_message}"
            SendMessageNotice.send_single_markdown(content, self.user_ids)
