# Automacoes do projeto

Comandos principais:

```bash
npm run sync:frontend
npm run check:static
npm run check:parser
npm run check:journeys
npm run check:functions
npm run check:visual
npm run predeploy
```

- `sync:frontend`: copia o prototipo local de `outputs/pilot-schedule-app` para `frontend/`.
- `check:static`: valida arquivos obrigatorios, sintaxe do JS e pontos criticos do HTML/CSS.
- `check:parser`: valida siglas e tipos relevantes do parser da escala.
- `check:journeys`: valida agrupamento de multiplas jornadas no mesmo dia.
- `check:functions`: valida sintaxe das Cloud Functions Firebase.
- `check:visual`: sobe um servidor estatico temporario e gera screenshot mobile em `artifacts/family-mobile.png`.
- `predeploy`: executa os checks determinísticos antes de publicar.

Se o app local ja estiver aberto, o teste visual pode reutilizar a URL existente:

```bash
VISUAL_URL=http://localhost:4173/ npm run check:visual
```

Observacao: em ambientes sandbox, abrir porta local ou iniciar Chrome pelo script pode ser bloqueado. No terminal normal do Mac, o comando deve rodar sem essa restricao.
