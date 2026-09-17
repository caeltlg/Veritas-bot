const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot Online!'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP do bot rodando na porta ${PORT}`);
});

require('./index');
