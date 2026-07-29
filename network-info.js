const NAME = 'network-info'
const $ = new Env(NAME)

// 1. 参数解析优化
let arg = {}
if (typeof $argument !== 'undefined') {
  arg = Object.fromEntries($argument.split('&').map(item => item.split('=')))
}
arg = { ...arg, ...$.getjson(NAME, {}) }

if (typeof $environment !== 'undefined' && $environment?.executor === 'event-network') {
  arg.TYPE = 'EVENT'
}
if (!isInteraction() && !isRequest() && !isTile() && !isPanel()) {
  arg.TYPE = 'EVENT'
}
if (isRequest()) {
  arg = { ...arg, ...parseQueryString($request.url) }
}

const keya = 'spe', keyb = 'ge', keyc = 'pin', keyd = 'gan', keye = 'pi', keyf = 'ob', bay = 'edtest'

let result = {}
let proxy_policy = ''
let title = ''
let content = ''

!(async () => {
  if (isTile()) {
    notify('网络信息', '面板', '开始查询')
  }

  // 2. 本地网络信息快速提取
  let SSID = '', LAN = '', LAN_IPv4 = '', LAN_IPv6 = ''
  if (typeof $network !== 'undefined') {
    const v4 = $network?.v4?.primaryAddress
    const v6 = $network?.v6?.primaryAddress
    if (arg.SSID == 1) SSID = $network?.wifi?.ssid || ''
    if (v4 && arg.LAN == 1) LAN_IPv4 = v4
    if (v6 && arg.LAN == 1 && arg.IPv6 == 1) LAN_IPv6 = v6
  } else if (typeof $config !== 'undefined') {
    try {
      const conf = JSON.parse($config.getConfig())
      if (arg.SSID == 1) SSID = conf?.ssid || ''
    } catch (e) {}
  } else if (typeof $environment !== 'undefined') {
    try {
      const version = $environment?.version || ''
      const os = version.split(' ')[0]
      if (os !== 'macOS' && arg.SSID == 1) SSID = $environment?.ssid || ''
      else if (os === 'macOS' && arg.LAN == 1) LAN_IPv4 = $environment?.ssid || ''
    } catch (e) {}
  }

  LAN = (LAN_IPv4 || LAN_IPv6) ? ['LAN:', LAN_IPv4, maskIP(LAN_IPv6)].filter(Boolean).join(' ') + '\n\n' : ''
  SSID = SSID ? `SSID: ${SSID}\n\n` : ''

  // 3. 完全并发网络请求 (核心加速)
  const isIPv6Enable = arg.IPv6 == 1
  const [proxiesRes, directInfo, proxyInfo, directV6, proxyV6] = await Promise.all([
    getProxies(),
    getDirectRequestInfo(),
    getProxyRequestInfo(),
    isIPv6Enable ? getDirectInfoIPv6() : Promise.resolve({}),
    isIPv6Enable ? getProxyInfoIPv6() : Promise.resolve({})
  ])

  const PROXIES = proxiesRes.PROXIES || []
  let { CN_IP = '', CN_INFO = '', CN_POLICY = '' } = directInfo || {}
  let { PROXY_IP = '', PROXY_INFO = '', PROXY_PRIVACY = '', PROXY_POLICY = '', ENTRANCE_IP = '' } = proxyInfo || {}
  let CN_IPv6 = directV6?.CN_IPv6 || ''
  let PROXY_IPv6 = proxyV6?.PROXY_IPv6 || ''

  // 事件去重校验
  if (arg.TYPE === 'EVENT') {
    const lastEvent = $.getjson('lastNetworkInfoEvent')
    if (
      CN_IP === lastEvent?.CN_IP &&
      CN_IPv6 === lastEvent?.CN_IPv6 &&
      PROXY_IP === lastEvent?.PROXY_IP &&
      PROXY_IPv6 === lastEvent?.PROXY_IPv6
    ) {
      $.log('网络信息未发生变化, 结束跳过')
      return
    }
    $.setjson({ CN_IP, PROXY_IP, CN_IPv6, PROXY_IPv6 }, 'lastNetworkInfoEvent')
  }

  // 4. 处理入口 IP 与 落地 IP
  if (arg.PRIVACY == '1' && PROXY_PRIVACY) PROXY_PRIVACY = `\n${PROXY_PRIVACY}`

  let ENTRANCE = ''
  if (ENTRANCE_IP) {
    const { IP: resolvedIP } = await resolveDomain(ENTRANCE_IP)
    if (resolvedIP) ENTRANCE_IP = resolvedIP
  }

  if (ENTRANCE_IP && ENTRANCE_IP !== PROXY_IP) {
    let [{ CN_INFO: ENTRANCE_INFO1 = '', isCN = false } = {}, { PROXY_INFO: ENTRANCE_INFO2 = '' } = {}] =
      await Promise.all([
        getDirectInfo(ENTRANCE_IP, arg.DOMESTIC_IPv4),
        getProxyInfo(ENTRANCE_IP, arg.LANDING_IPv4),
      ])
    if (ENTRANCE_INFO1 && isCN) ENTRANCE = `入口: ${maskIP(ENTRANCE_IP) || '-'}\n${maskAddr(ENTRANCE_INFO1)}`
    if (ENTRANCE_INFO2) {
      ENTRANCE = ENTRANCE
        ? `${ENTRANCE.replace(/^(.*?):/gim, '$11:')}\n${maskAddr(ENTRANCE_INFO2.replace(/^(.*?):/gim, '$12:'))}`
        : `入口: ${maskIP(ENTRANCE_IP) || '-'}\n${maskAddr(ENTRANCE_INFO2)}`
    }
  }
  ENTRANCE = ENTRANCE ? `${ENTRANCE}\n\n` : ''

  // 格式化输出文本
  CN_IPv6 = (CN_IPv6 && isIPv6(CN_IPv6) && isIPv6Enable) ? `\n${maskIP(CN_IPv6)}` : ''
  PROXY_IPv6 = (PROXY_IPv6 && isIPv6(PROXY_IPv6) && isIPv6Enable) ? `\n${maskIP(PROXY_IPv6)}` : ''

  if ($.isSurge() || $.isStash()) {
    CN_POLICY = CN_POLICY === 'DIRECT' ? '' : `策略: ${maskAddr(CN_POLICY) || '-'}\n`
  }

  CN_INFO = CN_INFO ? `\n${CN_INFO}` : ''
  const policy_prefix = ($.isQuanX() || $.isLoon()) ? '节点: ' : '代理策略: '
  PROXY_POLICY = PROXY_POLICY === 'DIRECT' ? `${policy_prefix}直连` : (PROXY_POLICY ? `${policy_prefix}${maskAddr(PROXY_POLICY) || '-'}` : '')
  proxy_policy = PROXY_POLICY

  PROXY_INFO = PROXY_INFO ? `\n${PROXY_INFO}` : ''
  title = PROXY_POLICY || '网络信息 📶'
  
  content = `${SSID}${LAN}${CN_POLICY}IP: ${maskIP(CN_IP) || '-'}${CN_IPv6}${maskAddr(
    CN_INFO
  )}\n\n${ENTRANCE}落地 IP: ${maskIP(PROXY_IP) || '-'}${PROXY_IPv6}${maskAddr(PROXY_INFO)}${PROXY_PRIVACY}`
  
  if (!isInteraction()) {
    content += `\n执行时间: ${new Date().toTimeString().split(' ')[0]}`
  }

  if (isTile()) {
    await notify('网络信息', '面板', '查询完成')
  } else if (!isPanel()) {
    if (arg.TYPE === 'EVENT') {
      await notify(
        `🇨🇳 ${maskIP(CN_IP) || '-'} ✈️ ${maskIP(PROXY_IP) || '-'}`.replace(/\s+/g, ' ').trim(),
        `${maskAddr(CN_INFO.replace(/(位置|运营商).*?:/g, '').replace(/\n/g, ' '))}`.replace(/\s+/g, ' ').trim(),
        `${maskAddr(PROXY_INFO.replace(/(位置|运营商).*?:/g, '').replace(/\n/g, ' '))}${CN_IPv6 ? `\n🌐 ${CN_IPv6.replace(/\n+/g, '')}` : ''}${PROXY_IPv6 ? `\n🌐 ${PROXY_IPv6.replace(/\n+/g, '')}` : ''}${SSID ? `\n${SSID}` : '\n'}${LAN}`.replace(/\s+/g, ' ').trim()
      )
    } else {
      await notify('网络信息 📶', title, content)
    }
  }
})()
  .catch(async e => {
    $.logErr(e)
    title = `⚠️`
    content = `${e?.message || e?.error || e}`
    await notify('网络信息 📶', title, content)
  })
  .finally(() => {
    if (isRequest()) {
      result = {
        response: {
          status: 200,
          body: JSON.stringify({ title, content }, null, 2),
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          },
        },
      }
    } else {
      result = { title, content, ...arg }
    }

    if (isInteraction()) {
      const html = `<div style="font-family: -apple-system; font-size: large">${`\n${content}${
        proxy_policy ? `\n\n${proxy_policy.replace(/^(.*?:\s*)(.*)$/, '$1<span style="color: #467fcf">$2</span>')}` : ''
      }`
        .replace(/^(.*?):/gim, '<span style="font-weight: bold">$1</span>:')
        .replace(/\n/g, '<br/>')}</div>`
      $.done({ title: '网络信息 📶', htmlMessage: html })
    } else {
      $.done(result)
    }
  })

// ==================== 辅助 API 请求函数 ====================

async function getEntranceInfo() {
  let IP = '', POLICY = ''
  if (isInteraction()) {
    try {
      if ($.isQuanX()) {
        const nodeName = $environment.params
        const { ret, error } = await $configuration.sendMessage({ action: 'get_server_description', content: nodeName })
        if (error) throw new Error(error)
        const proxy = Object.values(ret)[0]
        IP = proxy.match(/.+?\s*?=\s*?(.+?):\d+\s*?,.+/)?.[1] || ''
        POLICY = nodeName
      } else if ($.isLoon()) {
        IP = $environment?.params?.nodeInfo?.address || ''
        POLICY = $environment?.params?.node || ''
      }
    } catch (e) {
      $.logErr(`获取入口信息错误: ${e.message || e}`)
    }
  }
  return { IP, POLICY }
}

async function getDirectRequestInfo(PROXIES = []) {
  const [{ CN_IP, CN_INFO }, { POLICY }] = await Promise.all([
    getDirectInfo(undefined, arg.DOMESTIC_IPv4),
    getRequestInfo(new RegExp(`cip\\.cc|for${keyb}\\.${keya}${bay}\\.cn|rmb\\.${keyc}${keyd}\\.com\\.cn|api-v3\\.${keya}${bay}\\.cn|ipservice\\.ws\\.126\\.net|api\\.bilibili\\.com|api\\.live\\.bilibili\\.com|myip\\.ipip\\.net|ip\\.ip233\\.cn|ua${keye}\\.wo${keyf}x\\.cn|ip\\.im|ips\\.market\\.alicloudapi\\.com|api\\.ip\\.plus|ip\\.qtfm\\.cn|dashi\\.163\\.com|api\\.zhuishushenqi\\.com|admin-app\\.edifier\\.com`), PROXIES)
  ])
  return { CN_IP, CN_INFO, CN_POLICY: POLICY }
}

async function getProxyRequestInfo(PROXIES = []) {
  const [{ PROXY_IP, PROXY_INFO, PROXY_PRIVACY }, result] = await Promise.all([
    getProxyInfo(undefined, arg.LANDING_IPv4),
    ($.isSurge() || $.isStash())
      ? getRequestInfo(/ipinfo\.io|ip-score\.com|ipwhois\.app|ip-api\.com|api-ipv4\.ip\.sb/, PROXIES)
      : (($.isQuanX() || $.isLoon()) ? getEntranceInfo() : Promise.resolve({}))
  ])
  return {
    PROXY_IP,
    PROXY_INFO,
    PROXY_PRIVACY,
    PROXY_POLICY: result?.POLICY || '',
    ENTRANCE_IP: result?.IP || '',
  }
}

async function getRequestInfo(regexp, PROXIES = []) {
  let POLICY = '', IP = ''
  try {
    if ($.isSurge()) {
      const { requests } = await httpAPI('/v1/requests/recent', 'GET')
      const request = (requests || []).slice(0, 10).find(i => regexp.test(i.URL))
      if (request) {
        POLICY = request.policyName
        if (/\(Proxy\)/.test(request.remoteAddress)) {
          IP = request.remoteAddress.replace(/\s*\(Proxy\)\s*/, '')
        }
      }
    } else if ($.isStash()) {
      const res = await $.http.get({ url: `http://127.0.0.1:9090/connections` })
      const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body
      const connections = body?.connections || []
      const connection = connections.slice(0, 10).find(i => regexp.test(i?.metadata?.host || i?.metadata?.destinationIP)) || {}
      const proxy = (connection?.metadata?.chain || [])[0]
      POLICY = proxy || ''
      IP = PROXIES?.[proxy]?.match(/^(.*?):\d+$/)?.[1] || ''
    }
  } catch (e) {}
  return { POLICY, IP }
}

async function getDirectInfo(ip, provider) {
  let CN_IP = '', CN_INFO = '', isCN = false
  try {
    const res = await http({
      url: `https://rmb.${keyc}${keyd}.com.cn/itam/mas/linden/ip/request`,
      params: { ip },
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body
    const countryCode = body?.data?.countryIsoCode
    isCN = countryCode === 'CN'
    CN_IP = ip || body?.data?.ip
    CN_INFO = [
      ['位置:', getflag(countryCode), (body?.data?.country || '').replace(/\s*中国\s*/, ''), body?.data?.region, body?.data?.city].filter(Boolean).join(' '),
      ['运营商:', body?.data?.isp || '-'].filter(Boolean).join(' '),
      arg.ORG == 1 ? ['组织:', body?.data?.org || '-'].filter(Boolean).join(' ') : undefined,
    ].filter(Boolean).join('\n')
  } catch (e) {}
  return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN }
}

async function getDirectInfoIPv6() {
  let CN_IPv6 = ''
  try {
    const res = await http({
      url: `https://ipv6.ddnspod.com`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    CN_IPv6 = (res?.body || '').trim()
  } catch (e) {}
  return { CN_IPv6 }
}

async function getProxyInfo(ip, provider) {
  let PROXY_IP = '', PROXY_INFO = '', PROXY_PRIVACY = ''
  try {
    const p = ip ? `/${encodeURIComponent(ip)}` : ''
    const res = await http({
      ...(ip ? {} : getNodeOpt()),
      url: `http://ip-api.com/json${p}?lang=zh-CN`,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone CPU iPhone OS 13_2_3 like Mac OS X)' },
    })
    const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body
    PROXY_IP = ip || body?.query
    PROXY_INFO = [
      ['位置:', getflag(body?.countryCode), (body?.country || '').replace(/\s*中国\s*/, ''), body?.regionName?.split(/\s+or\s+/)[0], body?.city].filter(Boolean).join(' '),
      ['运营商:', body?.isp || body?.org || body?.as].filter(Boolean).join(' '),
      arg.ORG == 1 ? ['组织:', body?.org || '-'].filter(Boolean).join(' ') : undefined,
      arg.ASN == 1 ? ['ASN:', body?.as || '-'].filter(Boolean).join(' ') : undefined,
    ].filter(Boolean).join('\n')
  } catch (e) {}
  return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO), PROXY_PRIVACY }
}

async function getProxyInfoIPv6(ip) {
  let PROXY_IPv6 = ''
  try {
    const res = await http({
      ...(ip ? {} : getNodeOpt()),
      url: `https://api-ipv6.ip.sb/ip`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    PROXY_IPv6 = (res?.body || '').trim()
  } catch (e) {}
  return { PROXY_IPv6 }
}

// 统一封装的高性能 HTTP 请求函数（带 2.5s 超时断开）
async function http(opt = {}) {
  const TIMEOUT = parseFloat(opt.timeout || arg.TIMEOUT || 2.5)
  const timeoutMs = TIMEOUT * 1000

  return Promise.race([
    $.http.get(opt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP TIMEOUT')), timeoutMs))
  ]).catch(err => {
    $.logErr(`HTTP请求超时或失败: ${opt.url}`)
    return { body: '' }
  })
}

// 通用工具函数
function simplifyAddr(addr) {
  if (!addr) return ''
  return addr.split(/\n/).map(i => Array.from(new Set(i.split(/\s+/))).join(' ')).join('\n')
}

function maskAddr(addr) {
  if (!addr || arg.MASK != 1) return addr
  const parts = addr.split(' ')
  return parts.length >= 3 
    ? [parts[0], '*', parts[parts.length - 1]].join(' ') 
    : addr.substring(0, Math.floor(addr.length / 3)) + '*'.repeat(Math.floor(addr.length / 3)) + addr.substring(2 * Math.floor(addr.length / 3))
}

function maskIP(ip) {
  if (!ip || arg.MASK != 1) return ip
  return ip.includes('.') 
    ? [...ip.split('.').slice(0, 2), '*', '*'].join('.') 
    : [...ip.split(':').slice(0, 4), '*', '*', '*', '*'].join(':')
}

function getflag(e) {
  if (!e || arg.FLAG == 0) return ''
  try {
    return String.fromCodePoint(...e.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0)))
  } catch (err) {
    return ''
  }
}

function parseQueryString(url) {
  if (!url || !url.includes('?')) return {}
  return Object.fromEntries(new URLSearchParams(url.split('?')[1]))
}

const DOMAIN_RESOLVERS = {
  ali: async (domain, type) => {
    const resp = await http({ url: `http://223.6.6.6/resolve?name=${domain}&type=${type === 'IPv6' ? 'AAAA' : 'A'}&short=1` })
    const answers = JSON.parse(resp.body || '[]')
    return answers[answers.length - 1]
  }
}

async function resolveDomain(domain) {
  if (isIPv4(domain)) return { IP: domain, IPv4: domain }
  if (isIPv6(domain)) return { IP: domain, IPv6: domain }

  const [v4, v6] = await Promise.all([
    DOMAIN_RESOLVERS.ali(domain, 'IPv4').catch(() => null),
    DOMAIN_RESOLVERS.ali(domain, 'IPv6').catch(() => null)
  ])
  return { IP: v4 || v6, IPv4: v4, IPv6: v6 }
}

const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/
const IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/

function isIPv4(ip) { return IPV4_REGEX.test(ip) }
function isIPv6(ip) { return IPV6_REGEX.test(ip) }

async function getProxies() {
  let PROXIES = []
  if ($.isStash()) {
    try {
      const res = await $.http.get({ url: `http://127.0.0.1:9090/providers/proxies` })
      const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body
      PROXIES = Object.values(body.providers || {}).flatMap(i => i.proxies || []).reduce((obj, i) => {
        obj[i.name] = i.address
        return obj
      }, {})
    } catch (e) {}
  }
  return { PROXIES }
}

async function httpAPI(path = '/v1/requests/recent', method = 'GET', body = null) {
  return new Promise((resolve) => $httpAPI(method, path, body, result => resolve(result)))
}

function isRequest() { return typeof $request !== 'undefined' }
function isPanel() { return $.isSurge() && typeof $input !== 'undefined' && $input?.purpose === 'panel' }
function isTile() { return $.isStash() && (typeof $script !== 'undefined' && $script?.type === 'tile' || arg.TYPE === 'TILE') }
function isInteraction() {
  return ($.isQuanX() && typeof $environment !== 'undefined' && $environment?.executor === 'event-interaction') ||
         ($.isLoon() && typeof $environment !== 'undefined' && $environment?.params?.node)
}

function getNodeOpt() {
  if (isInteraction()) {
    if ($.isQuanX()) return { opts: { policy: $environment.params } }
    if ($.isLoon()) return { node: $environment.params.node }
  }
  return {}
}

async function notify(title, subt, desc, opts) {
  if (arg.TYPE === 'EVENT' || arg.notify == 1) $.msg(title, subt, desc, opts)
  else $.log('ℹ️', title, subt, desc)
}

// Env 环境定义
// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,a)=>{s.call(this,t,(t,s,r)=>{t?a(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const a=this.getdata(t);if(a)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,a)=>e(a))})}runScript(t,e){return new Promise(s=>{let a=this.getdata("@chavy_boxjs_userCfgs.httpapi");a=a?a.replace(/\n/g,"").trim():a;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[i,o]=a.split("@"),n={url:`http://${o}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":i,Accept:"*/*"},timeout:r};this.post(n,(t,e,a)=>s(a))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e);if(!s&&!a)return{};{const a=s?t:e;try{return JSON.parse(this.fs.readFileSync(a))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):a?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const a=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of a)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,a)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[a+1])>>0==+e[a+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,a]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,a,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,a,r]=/^@(.*?)\.(.*?)$/.exec(e),i=this.getval(a),o=a?"null"===i?null:i||"{}":"{}";try{const e=JSON.parse(o);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),a)}catch(e){const i={};this.lodash_set(i,r,t),s=this.setval(JSON.stringify(i),a)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:a,statusCode:r,headers:i,rawBody:o}=t,n=s.decode(o,this.encoding);e(null,{status:a,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:a,response:r}=t;e(a,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let a=require("iconv-lite");this.initGotEnv(t);const{url:r,...i}=t;this.got[s](r,i).then(t=>{const{statusCode:s,statusCode:r,headers:i,rawBody:o}=t,n=a.decode(o,this.encoding);e(null,{status:s,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&a.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let a={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in a)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?a[e]:("00"+a[e]).substr((""+a[e]).length)));return t}queryStr(t){let e="";for(const s in t){let a=t[s];null!=a&&""!==a&&("object"==typeof a&&(a=JSON.stringify(a)),e+=`${s}=${a}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",a="",r){const i=t=>{switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{let e=t.url||t.openUrl||t["open-url"];return{url:e}}case"Loon":{let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}case"Quantumult X":{let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,a=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":a}}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,a,i(r));break;case"Quantumult X":$notify(e,s,a,i(r));break;case"Node.js":}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),a&&t.push(a),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t.stack)}}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}
