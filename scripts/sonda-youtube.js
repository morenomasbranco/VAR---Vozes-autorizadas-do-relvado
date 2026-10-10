// Sonda: lê o separador «Diretos» (/streams) de alguns canais e mostra o que o leitor do servidor encontra
// (para confirmar que reconhece as transmissões em direto e as agendadas no formato atual do YouTube).
// Uso: node scripts/sonda-youtube.js @SkyNews @NASA @AFViseuTV
import { lerStreams, horaMarcada } from "../server/pt/youtube.js";

const CAB = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept-Language": "pt-PT,pt;q=0.9", Cookie: "CONSENT=YES+cb; SOCS=CAI" };
for (const c of process.argv.slice(2)) {
  try {
    const r = await fetch(`https://www.youtube.com/${c}/streams`, { headers: CAB });
    const html = await r.text();
    const st = lerStreams(html);
    const formatos = { videoRenderer: (html.match(/"videoRenderer":/g) || []).length, lockupViewModel: (html.match(/"lockupViewModel":/g) || []).length };
    console.log(`${c}: ${r.status} · ${st ? `${st.vistos} vídeos lidos · canal «${st.canal}»` : "sem ytInitialData"} · formatos ${JSON.stringify(formatos)}`);
    // os textos das etiquetas das miniaturas (para afinar o reconhecimento de «agendado»)
    const etiquetas = new Set([...html.matchAll(/"thumbnailBadgeViewModel":\{"text":"([^"]*)"[^}]*"badgeStyle":"([A-Z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`));
    console.log(`   etiquetas: ${[...etiquetas].slice(0, 12).join(" · ")}`);
    for (const d of st?.lista || []) if (d.marcada && !d.inicio) d.inicio = horaMarcada(await (await fetch(`https://www.youtube.com/watch?v=${d.videoId}`, { headers: CAB })).text());
    for (const d of st?.lista || []) console.log(`   ${d.aoVivo ? "AO VIVO" : "agendado"} ${d.inicio ? new Date(d.inicio).toISOString() : "(sem hora)"} ${d.espetadores ? `${d.espetadores} a ver ` : ""}${d.videoId} ${d.titulo}`);
  } catch (e) { console.log(`${c}: erro ${e.message}`); }
}
