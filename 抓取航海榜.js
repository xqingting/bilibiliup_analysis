const request = require('request');
const fs = require('fs');
const { info } = require('console');
const roomid = 22637261;//房间号,可以改
const ruid = 672328094;//主播uid,可以改
let group = [];
let pagelenth, url, number;
url = `https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid=${roomid}&ruid=${ruid}&page_size=29&page=1`;
request(url, (error, response, body) => {
  if (!error && response.statusCode == 200) {
    const data = JSON.parse(body).data;
    group.push(...data.top3);
    group.push(...data.list);
    pagelength = JSON.parse(body).data.info.page
    number = JSON.parse(body).data.info.num
  } else {
    console.log(error);
  }

  for (let page = 2; page <= pagelength; page++) {
    url = `https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid=${roomid}&ruid=${ruid}&page_size=29&page=${page}`;
    request(url, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        const data = JSON.parse(body).data;
        group.push(...data.list);
        if (group.length >= number) {
          const json = JSON.stringify({ group }, null, 2);
          fs.writeFile('output.json', json, 'utf8', (err) => {
            if (err) throw err;
            console.log('Data saved to output.json');
          });
        }
      } else {
        console.log(error);
      }
    });
  }
});