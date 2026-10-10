// Ponte do VAR no Google Apps Script (gratuita, corre nos servidores da Google, sem computador ligado).
// Os sites da FPF, do Instagram e do Facebook bloqueiam os servidores de alojamento; este script faz os pedidos
// por eles a partir dos endereços da Google. Só aceita pedidos com a chave abaixo e só para estes sites.
//
// 1. Muda a CHAVE para um texto só teu (e põe o mesmo texto no servidor, na variável PONTE_GOOGLE_CHAVE).
// 2. Cola este ficheiro em script.google.com (Novo projeto), e publica como «Aplicação Web»
//    (Executar como: Eu; Quem tem acesso: Qualquer pessoa). Ver deploy/GUIA-PONTE-GOOGLE.md.
// Limite da Google (conta gratuita): 20 000 pedidos por dia.
var CHAVE = "muda-esta-chave";

var SITES = [
  ".fpf.pt", "api.sofascore.com", "www.sofascore.com",
  "www.instagram.com", "i.instagram.com", "www.facebook.com", "m.facebook.com",
  "imginn.com", "www.picnob.com", "www.pixwox.com", "anonyig.com", "storiesig.info", "fastdl.app",
  "www.ligaportugal.pt", "www.zerozero.pt",
  "www.youtube.com"
];

function hostDe(u) { var m = String(u).match(/^https?:\/\/([^\/?#:]+)/i); return m ? m[1].toLowerCase() : ""; }
function permitido(u) {
  var h = hostDe(u);
  if (!/^https:\/\//i.test(u) || !h) return false;
  for (var i = 0; i < SITES.length; i++) {
    var s = SITES[i];
    if (s.charAt(0) === "." ? (h === s.slice(1) || h.slice(-s.length) === s) : h === s) return true;
  }
  return false;
}
// endereço de um redirecionamento (pode vir relativo)
function junta(base, loc) {
  if (/^https?:\/\//i.test(loc)) return loc;
  var origem = base.match(/^(https?:\/\/[^\/?#]+)/i)[1];
  if (loc.indexOf("//") === 0) return base.split(":")[0] + ":" + loc;
  if (loc.charAt(0) === "/") return origem + loc;
  return base.replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + loc;
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (x) { return json({ erro: "pedido inválido" }); }
  if (CHAVE === "muda-esta-chave" || p.chave !== CHAVE) return json({ erro: "chave" });
  var url = String(p.u || "");
  if (!permitido(url)) return json({ erro: "site" });
  var cab = {};
  for (var k in (p.cabecalhos || {})) {
    if (/^(host|connection|content-length|accept-encoding|x-ponte.*)$/i.test(k)) continue;
    cab[k] = String(p.cabecalhos[k]);
  }
  var metodo = String(p.metodo || "get").toLowerCase();
  try {
    for (var saltos = 0; ; saltos++) {
      var op = { method: metodo, headers: cab, followRedirects: false, muteHttpExceptions: true };
      if (p.corpo && metodo !== "get") op.payload = Utilities.base64Decode(p.corpo);
      var r = UrlFetchApp.fetch(url, op);
      var st = r.getResponseCode();
      var h = r.getAllHeaders();
      var loc = h.Location || h.location;
      if (p.redirect !== "manual" && [301, 302, 303, 307, 308].indexOf(st) >= 0 && loc && saltos < 5) {
        url = junta(url, String(loc));
        if (!permitido(url)) return json({ erro: "site" });
        if (st === 303) metodo = "get";
        continue;
      }
      var limpos = {};
      for (var n in h) if (!/^(set-cookie|content-encoding|content-length|transfer-encoding)$/i.test(n)) limpos[n] = String(h[n]);
      return json({ status: st, headers: limpos, url: url, corpo: Utilities.base64Encode(r.getContent()) });
    }
  } catch (x) {
    return json({ erro: String(x && x.message || x).slice(0, 300) });
  }
}

function doGet() { return json({ ok: true, ponte: "VAR" }); }
