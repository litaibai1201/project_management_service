# JR
def get_total_page(count, total_count):
    total_page = int(total_count / count)
    if total_count / count > total_page:
        total_page += 1
    return total_page


def convert_file_info_to_dict(file_info):
    file_info_dic = {}
    for info in file_info:
        last_folder = info.get("last_folder")
        if last_folder not in file_info_dic:
            file_info_dic[last_folder] = []
        file_info_dic[last_folder].append(
            {
                "file_url": info.get("file_url"),
                "file_name": info.get("file_name"),
                "file_ext": info.get("file_ext"),
                "created_at": info.get("created_at"),
                "size": info.get("size"),
            }
        )
    return file_info_dic
