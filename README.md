# Veritas-Bot

Este repositório contém um exemplo mínimo de um bot do Discord em Node.js (discord.js) preparado para deploy no Railway.

Como usar

1. Adicione um token do bot como variável de ambiente no Railway (Service → Variables):
   - Key: DISCORD_TOKEN
   - Value: <seu token>

2. Garanta que a branch `main` está conectada ao ambiente de produção e que Auto-deploy está ativado (já estava nas suas screenshots).

3. Faça push para `main` (os arquivos já foram adicionados por automação, se você preferir adicionar manualmente, copie os arquivos):

   git add .
   git commit -m "Add bot source + Dockerfile"
   git push origin main

4. O Railway deve construir a imagem automaticamente. Se preferir, você também pode remover o Dockerfile e deixar que Railway detecte Node.js via package.json.

Notas
- Para uptime 24/7 verifique o plano do Railway; o plano gratuito pode suspender serviços. Considere um plano pago ou um VPS para uptime garantido.

