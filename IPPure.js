
/***

[task_local]
event-interaction https://ddgksf2013.top/scripts/server-info-pure.js, tag=节点详情(Pure), img-url=checkmark.shield.fill.system
  
@Description: 使用 IPPure API 查询节点详细信息 (IP, ISP, 地区, 风控值, 类型)
@Update: 2025-12-14
***/

const url = "https://my.ippure.com/v1/info";
const opts = {
    policy: $environment.params
};

const myRequest = {
    url: url,
    headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    },
    opts: opts,
    timeout: 5000
};

$task.fetch(myRequest).then(response => {
    try {
        const data = JSON.parse(response.body);
        const htmlMessage = generateHtmlMessage(data);
        console.log(`节点: ${$environment.params}\nIP: ${data.ip}\nRisk: ${data.fraudScore}`);
        $done({ "title": "    🔎 IPPure 节点详情", "htmlMessage": htmlMessage });
    } catch (e) {
        handleError("解析失败");
    }
}, reason => {
    handleError("查询超时");
});

function handleError(msg) {
    const message = `<p style="text-align: center; font-family: -apple-system; font-size: large; font-weight: bold;">🛑 ${msg}</p>`;
    $done({ "title": "🔎 IPPure 查询结果", "htmlMessage": message });
}

function generateHtmlMessage(data) {
    let content = "";
    
    const flag = getFlagEmoji(data.countryCode);
    const ip = data.ip || "N/A";
    const isp = data.asOrganization || "N/A";
    const asn = data.asn ? `AS${data.asn}` : "N/A";
    
    let location = `${flag} ${data.countryCode}`;
    if (data.region) location += ` - ${data.region}`;
    if (data.city) location += ` - ${data.city}`;

    const typeStr = data.isResidential ? "住宅网络 🏠" : "数据中心 🏢";
    
    const score = data.fraudScore || 0;
    const riskInfo = getRiskLevel(score);

    const infos = [
        ["IP", ip],
        ["ISP", isp],
        ["ASN", asn],
        ["位置", location],
        ["类型", typeStr],
        ["风控值", `${score} %`],
        ["风险等级", riskInfo]
    ];

    let res = `<div style="text-align: center; font-family: -apple-system; font-size: 15px; line-height: 1.5;">`;
    res += `<hr style="margin: 10px 0; border: 0; border-top: 1px solid #ddd;"/>`; // 顶部横线
    
    infos.forEach(item => {
        res += `<b><font color="#888">${item[0]} : </font></b><font color="#000">${item[1]}</font><br/>`;
    });

    res += `<hr style="margin: 10px 0; border: 0; border-top: 1px solid #ddd;"/>`; // 底部横线
    
    // 添加节点名称
    res += `<font color="#6959CD"><b>节点</b> ➟ ${$environment.params}</font>`;
    res += `</div>`;
    
    return res;
}

function getRiskLevel(score) {
    if (score <= 25) return "<font color='#28a745'>低风险 ✅</font>"; // 0-25 绿色
    if (score <= 50) return "<font color='#ffc107'>中风险 🟡</font>"; // 26-50 黄色
    if (score <= 75) return "<font color='#ff8c00'>高风险 ⚠️</font>"; // 51-75 橙色
    return "<font color='#dc3545'>极高风险 ‼️</font>"; // 76-100 红色
}

function getFlagEmoji(countryCode) {
    if (!countryCode) return "🌍";
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

