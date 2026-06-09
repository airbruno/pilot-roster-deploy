# Pilot Roster Deploy

Estrutura:

```txt
frontend/  -> Vercel
backend/   -> Render
```

## Fluxo em produção

- `/` abre somente o portal da família.
- `/piloto` abre a área do piloto.
- O piloto importa o PDF em `/piloto` e publica a escala.
- A família acessa `/` e vê a última escala publicada.

## 1. Backend no Render

1. Crie um repositório no GitHub com esta pasta.
2. No Render, crie um novo **Web Service**.
3. Configure:
   - Root Directory: `outputs/pilot-roster-deploy/backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python server.py`
4. Adicione um Disk:
   - Mount Path: `/var/data`
   - Size: `1 GB`
5. Variáveis de ambiente:

```txt
DATA_DIR=/var/data
PILOT_TOKEN=uma-senha-forte
ALLOWED_ORIGIN=https://SEU-APP.vercel.app
```

Depois do deploy, copie a URL do serviço Render, por exemplo:

```txt
https://pilot-roster-api.onrender.com
```

Teste:

```txt
https://pilot-roster-api.onrender.com/api/health
```

## 2. Frontend no Vercel

1. No arquivo `frontend/config.js`, coloque a URL do backend:

```js
window.APP_CONFIG = {
  API_URL: "https://pilot-roster-api.onrender.com",
};
```

2. No Vercel, crie um novo projeto.
3. Configure:
   - Root Directory: `outputs/pilot-roster-deploy/frontend`
   - Framework Preset: `Other`
   - Build Command: vazio
   - Output Directory: `.`

O arquivo `vercel.json` já redireciona `/piloto` para a mesma aplicação.

## 3. Teste final

1. Acesse:

```txt
https://SEU-APP.vercel.app/piloto
```

2. Importe o PDF.
3. Clique em **Publicar escala**.
4. Informe o mesmo valor definido em `PILOT_TOKEN`.
5. Acesse:

```txt
https://SEU-APP.vercel.app/
```

6. Confirme que a visão da família carrega a escala publicada.

## Automacoes locais

Antes de publicar, rode os comandos dentro desta pasta:

```bash
npm run sync:frontend
npm run check:static
npm run check:backend
npm run check:visual
```

Ou rode tudo em sequência:

```bash
npm run predeploy
```

O `sync:frontend` copia a versao local de `outputs/pilot-schedule-app` para `frontend/`.
O `check:visual` gera uma captura mobile em `artifacts/family-mobile.png`.

## Observações

- O banco é SQLite em disco persistente do Render.
- Se você não adicionar Disk no Render, a escala pode ser perdida em redeploy/restart.
- PDFs escaneados como imagem ainda precisam de OCR; este backend extrai texto de PDFs com texto selecionável.
