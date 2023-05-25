let output = {};
let data = {};
let vmid = '672328094'//主播uid
let pn = '1'//第几页
let ps = '0'//一页几条，0为最大50
fetch(`https://api.bilibili.com/x/relation/followers?vmid=${vmid}&pn=${pn}&ps=${ps}&order=desc&jsonp=jsonp`)
    .then(response => response.text())
    .then(text => {
        data = JSON.parse(text);
        //console.log(data);
        let group = data.data.list;
        let length = group.length;
        for (let i = 0; i < length; i++) {
            //console.log(i);
            output[group[i].uname] = group[i].mid;
        }
        //output =JSON.stringify(output);
        let already;
        const fs = require('fs');
        if (fs.existsSync('output.json')) {
            fs.readFile('output.json', (err, data1) => {
                if (err) throw err;
                already = JSON.parse(data1);
                let reoutput = Object.assign({}, output, already);
                let length = Object.keys(reoutput).length;
                let newquan = length - Object.keys(already).length;
                reoutput = JSON.stringify(reoutput);
                //console.log(output);
                fs.writeFile('output.json', reoutput, (err) => {
                    if (err) throw err;
                    console.log(`数据保存完成，当前有${length}个粉丝 | ${now()}`);
                    fs.readFile('quantity.json', (err, data2) => {
                        if (err) throw err;
                        alquan = JSON.parse(data2);
                        alquan[`${now()}`] = newquan;
                        length = Object.keys(alquan).length;
                        alquan = JSON.stringify(alquan);
                        fs.writeFile('quantity.json', alquan, (err) => {
                            if (err) throw err;
                            console.log(`新增保存完成，新增${newquan}个粉丝，当前有${length}条新增信息。`);
                        });
                    });
                });

            });
        } else {
            console.log('The file does not exist!');
            return;
        }
    });
function now() {
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let time = year + '/' + month + '/' + day + ' ' + hour + ':' + minute;
    return time;
}