const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 8787;

function isPrivateHost(hostname) {
  if (["localhost","127.0.0.1","::1","[::1]"].includes(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const path = (req.url || "").split("?")[0];

  if (req.method === "POST" && path === "/api/chat") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let cfg;
      try { cfg = JSON.parse(body); }
      catch { res.writeHead(400); return res.end(JSON.stringify({error: {message: "Invalid JSON"}})); }
      const { url, key, model, messages } = cfg || {};
      if (!url || !key) { res.writeHead(400); return res.end(JSON.stringify({error: {message: "Missing url or key"}})); }

      let target;
      try { target = new URL(url.replace(/\/+$/, "") + "/chat/completions"); }
      catch { res.writeHead(400); return res.end(JSON.stringify({error: {message: "Invalid URL"}})); }
      if (isPrivateHost(target.hostname)) {
        res.writeHead(400);
        return res.end(JSON.stringify({error: {message: "Private hosts not allowed"}}));
      }

      const payload = JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: Array.isArray(messages) ? messages : [],
        stream: false
      });

      const upstream = https.request(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key,
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 120000
      }, up => {
        res.writeHead(up.statusCode, {"Content-Type": up.headers["content-type"] || "application/json"});
        up.pipe(res);
      });
      upstream.on("error", () => {});
      upstream.end(payload);
    });
    return;
  }

  res.writeHead(404, {"Content-Type": "application/json"});
  res.end(JSON.stringify({error: "Not found"}));
});

server.listen(PORT, "0.0.0.0", () => console.log("Proxy on port " + PORT));
