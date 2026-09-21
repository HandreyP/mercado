# Documentação do Mercado

Este é o documento central e vivo do projeto. Novas funcionalidades, alterações
de arquitetura, comandos, variáveis, decisões e limitações devem ser registadas
aqui no mesmo incremento em que forem implementadas. Decisões com alternativas
relevantes recebem também um ADR em `docs/adr/`.

## 1. Objetivo

Recolher preços públicos de supermercados portugueses, normalizá-los e permitir:

- pesquisar e ordenar produtos;
- comparar preços totais e por kg, litro ou unidade;
- consultar promoções e histórico;
- montar um carrinho e estimar o custo;
- futuramente comparar a mesma lista entre vários mercados.

O primeiro adaptador é o Pingo Doce. O núcleo da aplicação não contém seletores
ou regras específicas desse mercado.

## 2. Estado atual

Estão implementados:

- descoberta pelos sitemaps oficiais do Pingo Doce;
- extração de JSON-LD e HTML público;
- normalização de preço, peso, volume, unidades, doses e multipacks;
- recolha incremental por `lastmod`;
- snapshots JSON e estado operacional local;
- PostgreSQL em Docker;
- migrações SQL versionadas;
- importação transacional e idempotente de snapshots;
- sincronização atómica em lotes de até 500 produtos;
- cron diário às 03:00 em `Europe/Lisbon`;
- conservação dos documentos originais em `JSONB`;
- API HTTP de produtos, filtros, promoções, estatísticas e histórico;
- frontend simples com abas Produtos/Carrinho;
- carrinho persistente em `localStorage`.

Ainda não estão implementados:

- correspondência de produtos equivalentes entre mercados;
- autenticação ou carrinhos por utilizador;
- agendamento automático;
- folhetos e OCR;
- segundo supermercado.

## 3. Arquitetura

```mermaid
flowchart LR
    A[Sitemaps públicos] --> B[Adaptador do mercado]
    B --> C[Sync diário / snapshot JSON]
    C --> D[Importador idempotente]
    D --> E[(PostgreSQL)]
    E --> F[API Express]
    F --> G[Frontend]
    G --> H[Carrinho local]
```

Princípios:

- cada fonte tem um adaptador isolado;
- o snapshot é evidência imutável da recolha;
- o PostgreSQL contém o modelo consultável e histórico;
- o documento bruto também é conservado em `JSONB`;
- dinheiro é sempre representado em cêntimos;
- importar o mesmo snapshot duas vezes não cria duplicados;
- o frontend consome apenas a API, nunca os ficheiros de recolha.

### Estrutura de diretórios

```text
db/migrations/               migrações SQL ordenadas
docs/                        documentação viva e ADRs
public/                      frontend sem framework
src/api/                     filtros e consultas da API
src/core/                    descoberta e pipeline comum
src/db/                      ligação, migrações e importação
src/markets/pingo-doce/      regras específicas do Pingo Doce
src/services/                normalização, validação e ficheiros
test/                        testes e fixtures estáveis
data/                        snapshots e estado local, não versionados
```

## 4. Arranque rápido

Requisitos:

- Node.js 20 ou superior;
- npm;
- Docker com Docker Compose.

Instalar dependências:

```bash
npm install
```

Iniciar PostgreSQL e aplicar migrações:

```bash
npm run db:up
npm run db:migrate
```

Recolher uma amostra, importar e iniciar a aplicação:

```bash
npm run collect -- --limit 50 --sample
npm run import -- --file data/pingo-doce/products/<snapshot>.json
npm start
```

Abrir `http://localhost:3000`.

Para o funcionamento diário normal, a recolha e importação são feitas juntas:

```bash
npm run sync:daily
```

Parar a base de dados:

```bash
npm run db:down
```

O volume do PostgreSQL é preservado. Para o eliminar deliberadamente, use
`docker compose down --volumes`; esta operação apaga a base local.

## 5. Configuração

Valores locais predefinidos:

| Variável | Valor | Utilização |
|---|---|---|
| `DATABASE_URL` | `postgresql://mercado:mercado@localhost:5432/mercado` | Migrações, importador e API |
| `DATABASE_POOL_SIZE` | `10` | Máximo de ligações da API |
| `DATABASE_SSL` | `false` | Ativar SSL verificado |
| `PORT` | `3000` | Porta HTTP |
| `MARKET_USER_AGENT` | identificador do projeto | Pedidos às fontes públicas |
| `POSTGRES_PORT` | `5432` | Porta publicada pelo Compose |

O ficheiro `.env.example` serve de referência. `.env` está ignorado pelo Git, mas
não é carregado automaticamente: exporte as variáveis no terminal ou use o
mecanismo de configuração do ambiente onde a aplicação for executada.

## 6. Recolha incremental

Comandos principais:

```bash
npm run discover -- --limit 3
npm run collect -- --limit 50
npm run collect -- --limit 50 --sample
npm run collect -- --limit 50 --retry-failed
npm run collect -- --limit 50 --all
```

- a recolha normal considera apenas produtos novos ou alterados;
- `--sample` distribui deterministicamente a seleção pelo catálogo;
- `--retry-failed` dá prioridade a rejeições e erros anteriores;
- `--all` ignora o `lastmod` e força nova leitura;
- a cache HTTP evita pedidos repetidos durante 24 horas;
- o intervalo mínimo entre pedidos é 750 ms.

O estado fica em `data/<mercado>/state.json`. Contém URL, `lastmod`, tentativas,
falhas, última recolha e último preço, mas não substitui o catálogo na base.

## 7. PostgreSQL

### Modelo

| Tabela/view | Responsabilidade |
|---|---|
| `markets` | Supermercados registados |
| `market_products` | Identidade de um produto dentro de um mercado |
| `offers` | Observações históricas de preço |
| `current_offers` | Última oferta de cada produto |
| `scraping_runs` | Execuções importadas e respetivo hash |
| `scraping_errors` | Produtos rejeitados ou com erro |
| `raw_documents` | Documento normalizado original em `JSONB` |
| `schema_migrations` | Migrações já aplicadas |

O hash SHA-256 do snapshot é único. Uma segunda importação termina sem criar nova
execução, produto, oferta ou documento. Produtos usam a chave lógica
`(market_id, external_id)` e ofertas usam `(market_product_id, observed_at)`.

### Migrações

```bash
npm run db:migrate
```

Os ficheiros de `db/migrations/` são aplicados alfabeticamente, cada um dentro de
uma transação. Uma migração aplicada nunca deve ser alterada; crie outra.

### Importação

```bash
npm run import -- --file data/pingo-doce/products/<snapshot>.json
```

A importação inteira é transacional. Uma falha faz `ROLLBACK` e não deixa produtos
parcialmente importados.

Ofertas iguais à última observação não são inseridas novamente. Mudanças de preço,
promoção, preço anterior ou preço unitário criam uma nova observação histórica.

## 8. Sincronização automática

O comando recomendado é:

```bash
npm run sync -- --limit 500 --retry-failed
```

O fluxo:

1. obtém um advisory lock no PostgreSQL por supermercado;
2. lê o estado incremental;
3. recolhe no máximo 500 produtos válidos;
4. grava o snapshot;
5. importa o snapshot numa transação;
6. atualiza o estado local apenas após o `COMMIT`;
7. liberta o lock e apresenta mudanças de preço.

Se outra sincronização estiver ativa, a segunda termina com código 3. Se a
importação falhar, o estado não avança e os produtos permanecem elegíveis.

### Cron diário

Instalar ou atualizar a entrada, de forma idempotente:

```bash
./scripts/install-cron.sh
```

A tarefa instalada é:

```cron
CRON_TZ=Europe/Lisbon
0 3 * * * /caminho/do/projeto/scripts/run-daily-sync.sh
```

Executa todos os dias às 03:00, inicia o PostgreSQL se necessário, aplica
migrações pendentes e processa um lote de 500 com `--retry-failed`. Os logs ficam
em `logs/daily-sync.log`.

Remover a tarefa:

```bash
./scripts/remove-cron.sh
```

O cron depende de a máquina estar ligada às 03:00. Ele não recupera execuções
perdidas durante períodos em que o sistema esteve desligado.

## 9. API HTTP

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/health` | Estado da ligação à base |
| `GET` | `/api/markets` | Mercados disponíveis |
| `GET` | `/api/stats` | Totais do catálogo |
| `GET` | `/api/products` | Pesquisa, filtros, ordenação e paginação |
| `GET` | `/api/products/:id/history` | Histórico de um produto |

Parâmetros de `/api/products`:

| Parâmetro | Valores |
|---|---|
| `q` | Nome ou marca, máximo de 100 caracteres |
| `market` | Slug do mercado |
| `promotion` | `true` ou `false` |
| `sort` | `name_asc`, `price_asc`, `price_desc`, `unit_price_asc`, `newest` |
| `limit` | 1–100, predefinição 24 |
| `offset` | Deslocamento da paginação |

Exemplo:

```text
GET /api/products?q=arroz&promotion=true&sort=unit_price_asc&limit=24
```

## 10. Frontend

O frontend está em `public/` e usa HTML, CSS e JavaScript nativos.

Funcionalidades:

- abas Produtos e Carrinho;
- pesquisa por nome ou marca;
- filtro por mercado e promoção;
- ordenação por nome, preço, preço unitário ou atualização;
- carregamento paginado;
- indicação de preço anterior e promoção;
- indicador de subida ou descida entre observações;
- consulta do histórico de preços num diálogo;
- adicionar, remover e alterar quantidades;
- total estimado;
- persistência do carrinho no navegador.

O carrinho é uma simulação: conserva o preço mostrado quando o artigo foi
adicionado e não verifica stock, loja, entrega ou condições especiais.

## 11. Testes e validação

```bash
npm test
```

Os testes unitários não dependem da rede nem da base. A validação completa inclui:

```bash
npm run db:up
npm run db:migrate
npm run import -- --file <snapshot>
npm run import -- --file <o-mesmo-snapshot>
npm start
```

A segunda importação deve informar que o snapshot já existe.

Uma sincronização forçada sobre três produtos já importados confirmou que as três
ofertas permaneceram inalteradas e que o total histórico não aumentou.

A primeira amostra real teve 50 produtos de 25 categorias, incluindo 20
promoções. Encontrou e permitiu corrigir multipacks e doses. Quatro produtos sem
medida permaneceram válidos com aviso, sem inferir informação inexistente.

## 12. Segurança e utilização responsável

- só são consultados sitemaps e páginas públicas permitidas;
- não são usados endpoints internos bloqueados, login ou CAPTCHA;
- pedidos têm identificação, cache, limite de frequência e repetição controlada;
- parâmetros de ordenação da API usam uma lista fechada;
- todas as consultas variáveis usam parâmetros SQL;
- credenciais do Compose são apenas para desenvolvimento local;
- a API não deve ser exposta publicamente sem autenticação, rate limiting e
  configuração de produção.

## 13. Limitações conhecidas

- preços e disponibilidade podem depender de localização ou loja;
- o sitemap pode conter produtos sem preço atual;
- alterações ao HTML podem exigir atualização do adaptador;
- ainda não existe produto canónico entre mercados;
- o histórico só cresce quando novos snapshots são importados;
- promoções complexas, cartões e cupões ainda não têm modelo completo.

## 14. Decisões

- [ADR 0001 — PostgreSQL com JSONB](adr/0001-postgresql-jsonb.md)

## 15. Registo de evolução

### 2026-09-21 — Sincronização diária

- comando atómico `sync` com lote máximo de 500;
- advisory lock contra execuções concorrentes;
- estado atualizado apenas depois da importação;
- histórico sem ofertas redundantes;
- cron diário às 03:00 com logs locais.
- consulta de histórico e tendência de preço no frontend.

### 2026-09-21 — Persistência, API e frontend inicial

- Docker Compose com PostgreSQL 16;
- esquema relacional, índices e view de ofertas atuais;
- migrações e importador idempotente;
- API de catálogo e histórico;
- frontend de produtos e carrinho;
- documentação central criada.

### 2026-09-21 — Recolha incremental

- estado local versionado;
- seleção por `lastmod`;
- repetição de falhas e amostra determinística;
- relatório de qualidade;
- suporte corrigido para multipacks e doses.

### 2026-09-21 — Primeiro coletor

- adaptador do Pingo Doce;
- leitura de sitemaps, JSON-LD e HTML;
- normalização e validação;
- snapshots JSON e testes com fixtures.

## 16. Próximos marcos

1. aumentar gradualmente a cobertura do Pingo Doce através dos lotes diários;
2. adicionar métricas e alerta para falhas do cron;
3. modelar produtos canónicos e correspondências;
4. adicionar um segundo supermercado;
5. comparar o carrinho entre mercados;
6. tratar promoções condicionais e folhetos.
