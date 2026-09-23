# ADR 0003 — Sincronização resiliente e observável

- Estado: aceite
- Data: 2026-09-23

## Contexto

Uma execução real do cron terminou antes da recolha por uma falha temporária de
DNS. O cliente HTTP fazia três tentativas próximas, mas o fluxo diário não era
repetido e falhas anteriores ao snapshot não ficavam na base de dados.

## Decisão

Cada tentativa do fluxo completo é persistida em `sync_executions` antes do
primeiro acesso ao mercado. A linha passa de `running` para `completed` ou
`failed` e conserva origem, lote, número da tentativa, tempos, métricas e erro.

Falhas transitórias de DNS, ligação, timeout, HTTP 429 e HTTP 5xx podem repetir o
fluxo completo. A execução diária permite três tentativas, com espera progressiva
de 5 e 15 minutos. Erros definitivos e conflitos de lock não são repetidos.

O estado fica disponível por `/api/sync-status` e num painel pequeno do frontend.
O log local roda ao atingir 5 MB e conserva sete arquivos, valores configuráveis.

## Consequências

- falhas antes da criação do snapshot deixam evidência consultável;
- o estado incremental continua a avançar apenas após importação bem-sucedida;
- snapshots e importações idempotentes tornam segura a repetição completa;
- uma indisponibilidade pode prolongar o cron por até vinte minutos de espera;
- falha da própria base ainda pode impedir o registo da tentativa;
- notificações externas continuam opcionais e ficam para um marco posterior.
