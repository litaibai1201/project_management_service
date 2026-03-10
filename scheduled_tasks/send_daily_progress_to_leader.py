import requests

from common.common_tools import CommonTools
from configs.constant import conf
from configs.senddingplus import SendMessageNotice
from scheduled_tasks.models import (OperFunctionDataModel, OperProjectDataModel,
                                    OperUserHierarchyModel)
from serialize.model_serizlize import (FunctionDataModelSchema,
                                       ProjectDataModelSchema)


class SummarizeDailyProgress:
    def __init__(self) -> None:
        self.opdm = OperProjectDataModel()
        self.ofdm = OperFunctionDataModel()
        self.fdms = FunctionDataModelSchema(
            only=[
                "function_nm",
                "project_id",
                "progress",
                "updated_at",
                "developers",
                "expected_end_date",
                "group1",
                "group2",
            ],
            many=True,
        )
        self.pdms = ProjectDataModelSchema(many=True)
        self.ouhrm = OperUserHierarchyModel()
        self.date = CommonTools.get_now("date")
        self.after_week_date = CommonTools.get_now("date", 7)
        self.url = conf["search_name"]["url"]

    def __search_username(self, developers):
        developers = developers.split(";")
        name_list = [
            req["content"]["chnname"]
            for userid in developers
            if (
                req := requests.get(
                    self.url, params={"workno": userid, "keyword": ""}
                ).json()
            ).get("content")
        ]
        result = "，".join(name_list)
        return result

    def __handle_send_text(self, pro, data_dict):
        fun_data = data_dict.get(pro["id"], [])
        if len(fun_data) > 0:
            output = []
            for category_index, (category, subcategories) in enumerate(
                fun_data.items(), start=1
            ):
                output.append(f"{category_index}.{category}:\n\n")
                for subcategory_index, (subcategory, items) in enumerate(
                    subcategories.items(), start=1
                ):
                    output.append(
                        f"  {category_index}.{subcategory_index} {subcategory}:\n\n"
                    )
                    for item_index, item in enumerate(items, start=1):
                        name_list = self.__search_username(item["developers"])
                        if self.date > item["expected_end_date"]:
                            output.append(
                                f" {category_index}.{subcategory_index}.{item_index} <font color='#FF0000'>{item['function_nm']}：{item['progress']}% {name_list} {item['expected_end_date']} </font>\n\n"
                            )
                        else:
                            output.append(
                                f" {category_index}.{subcategory_index}.{item_index} {item['function_nm']}：{item['progress']}% {name_list} {item['expected_end_date']}\n\n"
                            )
            return "".join(output)

    def notice_text_to_leader(self, pro_list, data_dict, message):
        for pro in pro_list:
            content = self.__handle_send_text(pro, data_dict)
            if content:
                message += f"**{pro['project_nm']}**：\n\n{content}\n"
        return message

    def obtain_fun_data_from_db(self, pid, data_dict, fun_list):
        group1_dict = {}
        if fun_list:
            for fdata in fun_list:
                group1 = fdata["group1"]
                group2 = fdata["group2"] if fdata["group2"] else "其他"
                if group1 not in group1_dict:
                    group1_dict[group1] = {}
                if group2 not in group1_dict[group1]:
                    group1_dict[group1][group2] = []
                group1_dict[group1][group2].append(fdata)
            data_dict[pid] = group1_dict

    def __hadle_week_fun_data(self, pid_list):
        week_data_dict = {}
        for pid in pid_list:
            fun_list = self.ofdm.get_next_week_fun_data(
                pid, self.date, self.after_week_date
            )
            fun_list = self.fdms.dump(fun_list)
            self.obtain_fun_data_from_db(pid, week_data_dict, fun_list)
        return week_data_dict

    def __hadle_daily_fun_data(self, pid_list):
        daily_data_dict = {}
        for pid in pid_list:
            fun_list = self.ofdm.get_daily_fun_data(pid, self.date)
            fun_list = self.fdms.dump(fun_list)
            self.obtain_fun_data_from_db(pid, daily_data_dict, fun_list)
        return daily_data_dict

    def obtain_pro_data_from_db(self):
        pro_list = self.opdm.get_pro_data()
        pid_list = [pro.id for pro in pro_list]
        pro_list = self.pdms.dump(pro_list)
        return pro_list, pid_list

    def __judage_is_send_message(self, pro_list, daily_data_dict, week_data_dict):
        daily_message = ""
        week_message = ""
        if daily_data_dict:
            daily_message = self.notice_text_to_leader(
                pro_list,
                daily_data_dict,
                message="<font color='#006400'>1、單天進度統計：\n\n </font>",
            )
        if week_data_dict:
            message = (
                "<font color='#006400'>2、下週待完成的任務：\n\n </font>"
                if daily_message
                else "<font color='#006400'>1、下週待完成的任務：\n\n </font>"
            )
            week_message = self.notice_text_to_leader(
                pro_list, week_data_dict, message=message
            )
        return daily_message, week_message

    def main(self):
        # 從本地層級表動態獲取頂層主管工號，取代原先的硬編碼列表
        user_ids = self.ouhrm.get_top_level_supervisors()
        if not user_ids:
            return
        pro_list, pid_list = self.obtain_pro_data_from_db()
        if pid_list:
            daily_data_dict = self.__hadle_daily_fun_data(pid_list)
            week_data_dict = self.__hadle_week_fun_data(pid_list)
            daily_message, week_message = self.__judage_is_send_message(
                pro_list, daily_data_dict, week_data_dict
            )
            if daily_message or week_message:
                text = f"副理，您好！以下为專案進度匯總：\n\n {daily_message} \n\n {week_message}"
                SendMessageNotice.send_single_markdown(text, user_ids)
