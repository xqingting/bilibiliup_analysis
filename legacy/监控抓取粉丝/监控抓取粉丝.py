import requests
import json
import time
from datetime import datetime
import os

# 输入验证函数，确保输入为数字


def validate_input(prompt):
    while True:
        user_input = input(prompt)
        if user_input.isdigit():
            return int(user_input)
        else:
            print("输入错误，请输入一个数字。")

# 获取当前时间


def get_current_time():
    now = datetime.now()
    return now.strftime("%Y/%m/%d %H:%M")

# 主程序部分


def main(vmid):
    pn = '1'  # 第几页
    ps = '0'  # 一页几条，0为最大50

    # 检查文件是否存在
    filename = f'{vmid}.json'
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as file:
            already = json.load(file)
            print('已有文件，正在监控! 目前共抓取' + str(len(already)) + '个粉丝')
    else:
        print('第一次开始监控，已新建文件!')
        open(filename, 'w').close()  # 创建空文件
        already = {}

    output = {}
    response = requests.get(
        f"https://api.bilibili.com/x/relation/followers?vmid={vmid}&pn={pn}&ps={ps}&order=desc&jsonp=jsonp")

    if response.status_code == 200:
        data = json.loads(response.text)
        group = data["data"]["list"]
        length = len(group)
        for i in range(length):
            output[group[i]["uname"]] = group[i]["mid"]

        reoutput = {**output, **already}
        length = len(reoutput)
        newquan = length - len(already)

        with open(f'{vmid}.json', 'w', encoding='utf-8') as file:
            json.dump(reoutput, file, ensure_ascii=False, indent=4)
        print(f"数据保存完成，当前有{length}个粉丝 | {get_current_time()}")

        if os.path.exists(f'{vmid}_records.json'):
            with open(f'{vmid}_records.json', 'r', encoding='utf-8') as file:
                alquan = json.load(file)
        else:
            alquan = {}

        alquan[get_current_time()] = newquan
        length = len(alquan)

        with open(f'{vmid}_records.json', 'w', encoding='utf-8') as file:
            json.dump(alquan, file, ensure_ascii=False, indent=4)
        print(f"新增保存完成，新增{newquan}个粉丝，当前有{length}条新增信息。")
    else:
        print(response.text)

# 主程序入口


def run_program():
    vmid = validate_input("请输入主播UID：")
    main(vmid)

    # 定时运行每10分钟
    while True:
        time.sleep(600)
        main(vmid)


run_program()
