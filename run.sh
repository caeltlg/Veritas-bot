#!/bin/bash

# Script de inicialização 24/7 para o Veritas Bot

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arquivo de log
LOG_FILE="bot.log"

echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando Veritas Bot em modo 24/7${NC}" | tee -a "$LOG_FILE"

# Contador de reinicializações
RESTART_COUNT=0
MAX_RESTARTS=10
RESTART_WINDOW=3600  # 1 hora
RESTART_TIMES=()

while true; do
  CURRENT_TIME=$(date +%s)
  
  # Remove timestamps antigos (mais de RESTART_WINDOW)
  RESTART_TIMES=("${RESTART_TIMES[@]}" "$CURRENT_TIME")
  RESTART_TIMES=($(printf '%s\n' "${RESTART_TIMES[@]}" | awk -v cutoff=$((CURRENT_TIME - RESTART_WINDOW)) '$1 > cutoff'))
  
  # Verifica se ultrapassou limite de restarts
  if [ ${#RESTART_TIMES[@]} -gt $MAX_RESTARTS ]; then
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: Muitas reinicializações em pouco tempo (${#RESTART_TIMES[@]} em 1 hora)${NC}" | tee -a "$LOG_FILE"
    echo -e "${RED}Verifique os erros acima. Aguardando 10 minutos antes de tentar novamente...${NC}" | tee -a "$LOG_FILE"
    sleep 600
    RESTART_TIMES=()
  fi
  
  echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando processo do bot...${NC}" | tee -a "$LOG_FILE"
  
  # Executa o bot e loga output
  node index.js 2>&1 | tee -a "$LOG_FILE"
  
  EXIT_CODE=$?
  echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Bot encerrado com código: $EXIT_CODE${NC}" | tee -a "$LOG_FILE"
  
  # Aguarda antes de reiniciar (backoff strategy)
  WAIT_TIME=$((5 + RESTART_COUNT * 2))
  if [ $WAIT_TIME -gt 60 ]; then
    WAIT_TIME=60
  fi
  
  echo -e "${YELLOW}Reiniciando em $WAIT_TIME segundos... (Reinício #$(( ${#RESTART_TIMES[@]} + 1 )))${NC}" | tee -a "$LOG_FILE"
  sleep "$WAIT_TIME"
done
