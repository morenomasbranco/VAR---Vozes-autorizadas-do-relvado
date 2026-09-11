// Liga a tua conta Telegram uma vez e mostra a sessão a pôr no .env (TG_SESSION).
import "dotenv/config";
import readline from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const apiId = Number(process.env.TG_API_ID || (await rl.question("api_id (de my.telegram.org): ")));
const apiHash = process.env.TG_API_HASH || (await rl.question("api_hash: "));

const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
client.setLogLevel("error");
await client.start({
  phoneNumber: () => rl.question("Número de telemóvel (com +351): "),
  phoneCode: () => rl.question("Código que o Telegram te enviou: "),
  password: () => rl.question("Palavra-passe da verificação em dois passos (se tiveres): "),
  onError: (e) => console.error(e.message),
});
console.log("\nSessão iniciada. Copia esta linha para o .env:\n");
console.log(`TG_SESSION=${client.session.save()}\n`);
rl.close();
await client.disconnect();
process.exit(0);
