import os
import PySimpleGUI as sg
import hashlib
import json
import time
import httpx
import concurrent.futures
import easygui
from functools import reduce

# 设置请求头
HEADERS = {"User-Agent": "Mozilla/5.0",
           "Referer": "https://space.bilibili.com/"}


def uni2Chinese(unicode_str):  # 将Unicode字符串转换为中文
    decoded_str = unicode_str.encode().decode('UTF-8')
    return decoded_str


def getMixinKey(ae):  # 获取MixinKey
    oe = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41,
          13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]
    le = reduce(lambda s, i: s + ae[i], oe, "")
    return le[:32]


def encWbi(params: dict):  # 加密wbi参数
    # 发送GET请求，获取wbi_img数据
    resp = httpx.get("https://api.bilibili.com/x/web-interface/nav")
    wbi_img: dict = resp.json()["data"]["wbi_img"]
    img_url: str = wbi_img.get("img_url")
    sub_url: str = wbi_img.get("sub_url")
    img_value = img_url.split("/")[-1].split(".")[0]
    sub_value = sub_url.split("/")[-1].split(".")[0]
    me = getMixinKey(img_value + sub_value)
    wts = int(time.time())
    params["wts"] = wts
    params = dict(sorted(params.items()))
    Ae = "&".join([f'{key}={value}' for key, value in params.items()])
    w_rid = hashlib.md5((Ae + me).encode(encoding='utf-8')).hexdigest()
    return w_rid, wts


def process_delete(json_data):  # 处理JSON数据，删除多余的内容
    processed_data = {}
    # 要提取的字段
    fields = [
        "mid", "name", "sex", "sign", "level", "birthday", "school.name",
        "follower", "following", "official.type", "vip.type", "vip.status",
        "profession.title", "archive_count", "like_num", "article_count", "fans_medal.wear", "fans_medal.medal.medal_name",
        "fans_medal.medal.level",
        "fans_medal.medal.target_id"
    ]
    for field in fields:
        field_parts = field.split(".")
        field_value = json_data
        for part in field_parts:
            if isinstance(field_value, dict) and part in field_value:
                field_value = field_value[part]
            else:
                field_value = None
                break
        if field_value is None:
            field_value = "无"
        if isinstance(field_value, str):
            processed_data[field] = uni2Chinese(field_value)
        else:
            processed_data[field] = field_value
    processed_data = json.dumps(processed_data, ensure_ascii=False)
    return processed_data


def process_name(json_data_str):  # 处理JSON数据，提取指定字段并进行映射
    processed_data = {}
    json_data = json.loads(json_data_str)
    field_mapping = {
        "mid": "uid",
        "name": "昵称",
        "sex": "性别",
        "birthday": "生日",
        "sign": "签名",
        "level": "等级",
        "follower": "粉丝数",
        "following": "关注数",
        "archive_count": "投稿数",
        "like_num": "获赞数",
        "vip.status": "大会员状态",
        "vip.type": "大会员类型",
        "school.name": "学校",
        "fans_medal.wear": "佩戴粉丝勋章",
        "fans_medal.medal.medal_name": "粉丝勋章名称",
        "fans_medal.medal.level": "粉丝勋章等级",
        "fans_medal.medal.target_id": "粉丝勋章所属UP的mid",
        "official.type": "认证类型",
        "profession.title": "所属机构"
    }

    for field, replacement in field_mapping.items():
        if field in json_data:
            value = json_data[field]

            if field == "vip.type":
                value_mapping = {
                    0: "无",
                    1: "月大会员",
                    2: "年度及以上大会员"
                }
                value = value_mapping.get(value, value)
            elif field == "official.type":
                value_mapping = {
                    -1: "无",
                    0: "个人认证",
                    1: "机构认证"
                }
                value = value_mapping.get(value, value)
            elif field == "vip.status":
                value_mapping = {
                    0: "无",
                    1: "有"
                }
                value = value_mapping.get(value, value)

            processed_data[replacement] = value

    processed_data = json.dumps(processed_data, ensure_ascii=False)
    return processed_data


def process_task(mid):  # 处理任务，获取用户信息
    out = {}
    url_params = {
        "mid": mid,
        "token": "",
        "platform": "web",
        "web_location": "1550101"
    }
    w_rid, wts = encWbi(url_params)
    params = {
        "w_rid": w_rid,
        "wts": wts
    }
    params.update(url_params)
    # 发送GET请求，获取用户信息和卡片信息
    basic = httpx.get(
        url="https://api.bilibili.com/x/space/wbi/acc/info",
        params=params,
        headers=HEADERS
    ).json()
    follow = httpx.get(
        url="https://api.bilibili.com/x/web-interface/card",
        params=params,
        headers=HEADERS
    ).json()
    if basic.get("data") is not None:
        out = basic["data"]
        type = 2  # 基本信息
        out.update({"follower": 0, "following": 0})
        if follow.get("data") is not None:
            out.update({
                "follower": follow["data"]["follower"],
                "following": follow["data"]["card"]["attention"],
                "like_num": follow["data"]["like_num"],
                "archive_count": follow["data"]["archive_count"]
            })
            type = 1  # 完全体

        return process_name(process_delete(out)), type, mid
    return '无效', 3, mid  # 无效


print(process_task(34503997))


def parallel_processing(mids):  # 并行处理任务
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_task, mid) for mid in mids]
        results = []
        unmids = []
        wrongmids = []
        unresults = []
        wmid = 0
        i = 0
        count = len(mids)
        for future in concurrent.futures.as_completed(futures):
            try:
                i += 1
                rresult = future.result()
                result, type, wmid = rresult
                print(type,  i, '/', count)
                if type == 1:  # 完全体
                    results.append(result)
                elif type == 2:  # 基本信息
                    unmids.append(wmid)
                    unresults.append(result)
                elif type == 3:  # 无效
                    wrongmids.append(wmid)
            except Exception as e:
                print(f"Error occurred: {e}")

    return results, unmids, wrongmids, unresults


def process_file(file_path):  # 处理文件
    lines = []
    file_extension = os.path.splitext(file_path)[1].lower()

    if file_extension == ".txt":
        with open(file_path, 'r') as file:
            for line in file:
                lines.append(line.strip())
    elif file_extension == ".json":
        with open(file_path, 'r') as file:
            data = json.load(file)
            if isinstance(data, list):
                lines = data
            elif isinstance(data, dict):
                lines = list(data.values())

    json_data = {}
    results, unmids, wrongmids, unresults = parallel_processing(lines)
    count = len(results)
    for i, mid in enumerate(results):
        aresult = json.loads(results[i])
        json_data[aresult['uid']] = aresult
        print(f"{i+1}")
    print(f"共{count}/{len(lines)}个，{len(unmids)}个未完全体，{len(wrongmids)}个无效")
    if len(unmids) > 0:
        if (easygui.ynbox('是否加入未完全体？', '提示', ('是', '否'))):
            if len(unmids) > 0:
                count += len(unresults)
                for i, mid in enumerate(unresults):
                    aresult = json.loads(unresults[i])
                    json_data[aresult['uid']] = aresult
                    print(f"{i+1}")
                print(f"未完全体已加入，共{count}/{len(lines)}个，{len(wrongmids)}个无效")
        else:
            wrongmids.extend(unmids)
    file_name = os.path.basename(file_path)

    if len(wrongmids) > 0:
        output_file = os.path.join(os.path.dirname(
            file_path), f"{os.path.splitext(file_name)[0]}_未处理.txt")
        with open(output_file, 'w', encoding='utf-8') as outfile:
            outfile.write("\n".join(wrongmids))
    output_file = os.path.join(os.path.dirname(
        file_path), f"{os.path.splitext(file_name)[0]}_已处理.json")
    with open(output_file, 'w', encoding='utf-8') as outfile:
        json.dump(json_data, outfile, ensure_ascii=False)
    print("处理完成！")


# 创建PySimpleGUI界面
sg.theme("DefaultNoMoreNagging")

layout = [
    [sg.Text("选择文件处理")],
    [sg.Input(key="-FILE-", enable_events=True, visible=False), sg.FileBrowse("上传文件", key="-BROWSE-",
                                                                              file_types=(("Text Files", "*.txt"), ("JSON Files", "*.json")), size=(30, 1))],
    [sg.Button("退出", size=(30, 1))],
]

window = sg.Window("阿b爬取", layout, size=(280, 100), finalize=True)
sg.set_options(font=("Arial", 12))

while True:
    event, values = window.read()

    if event == sg.WINDOW_CLOSED or event == "退出":
        break
    elif event == "-FILE-":
        file_path = values["-BROWSE-"]
        window["-FILE-"].update(file_path)
        process_file(file_path)
        sg.popup("处理完成！", title="提示")

window.close()
print("程序已退出！")
