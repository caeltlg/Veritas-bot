#!/bin/bash
while true; do
  echo "Iniciando o bot Veritas..."
  node index.js
  echo "O bot fechou ou deu erro. Reiniciando em 5 segundos..."
  sleep 5
done
