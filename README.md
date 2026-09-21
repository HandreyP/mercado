# Mercado

Recolha e normalização de preços públicos de supermercados portugueses. O primeiro
adaptador é o **Pingo Doce**, mas a descoberta, a recolha, a validação e a gravação
dos dados são independentes do supermercado.

> A documentação completa e o registo vivo do projeto estão em
> [docs/README.md](docs/README.md). A partir deste marco, alterações funcionais e
> arquiteturais devem atualizar esse documento.

## Estado atual

O primeiro marco está funcional:

- lê o índice oficial de sitemaps;
- seleciona apenas sitemaps de produto;
- extrai URL, ID, data de alteração e imagens;
- combina JSON-LD e HTML das páginas públicas;
- recolhe nome, marca, categorias, preço, promoção e unidade;
- normaliza peso, volume e unidades;
- rejeita produtos sem preço válido;
- grava snapshots JSON com valores monetários em cêntimos;
- mantém um estado incremental por produto e respetivo `lastmod`;
- permite repetir falhas e criar amostras determinísticas do catálogo;
- conserva uma cache local para reduzir pedidos repetidos.

Os folhetos e OCR ainda não fazem parte deste incremento.

## Requisitos

- Node.js 20 ou superior;
- npm.

```bash
npm install
```

## Utilização

Descobrir três entradas sem visitar as páginas dos produtos:

```bash
npm run discover -- --limit 3
```

Recolher três produtos válidos e gerar um snapshot:

```bash
npm run collect -- --limit 3
```

A recolha é incremental por predefinição: só considera produtos novos ou cujo
`lastmod`/URL mudou. Para validar uma amostra espalhada pelo catálogo:

```bash
npm run collect -- --limit 50 --sample
```

Repetir rejeições e erros anteriores:

```bash
npm run collect -- --limit 50 --retry-failed
```

Forçar uma nova leitura mesmo sem alterações no sitemap:

```bash
npm run collect -- --limit 50 --all
```

Os snapshots são criados em:

```text
data/pingo-doce/products/<data-e-hora>.json
data/pingo-doce/state.json
```

Outras opções:

```bash
node src/index.js help
node src/index.js collect --market pingo-doce --limit 10 --output data
node src/index.js collect --limit 3 --no-cache
node src/index.js collect --limit 50 --changed-only
```

O limite máximo por execução é 100 produtos. A recolha usa, por predefinição, um
intervalo mínimo de 750 ms entre pedidos, três tentativas para erros temporários e
uma cache de 24 horas em `.cache/http`.

Para identificar o projeto com outro `User-Agent`:

```bash
MARKET_USER_AGENT='meu-projeto/0.1 (contacto@example.com)' npm run collect -- --limit 3
```

## Modelo de dados

Todos os adaptadores devem produzir a mesma representação. Exemplo abreviado:

```json
{
  "marketId": "pingo-doce",
  "externalId": "1805",
  "name": "Sal Fino",
  "brand": "Pingo Doce",
  "categories": ["Mercearia", "Sal"],
  "package": {
    "quantity": 0.25,
    "unit": "kg",
    "normalizedQuantity": 0.25,
    "normalizedUnit": "kg"
  },
  "offer": {
    "currency": "EUR",
    "priceCents": 29,
    "originalPriceCents": null,
    "pricePerBaseUnitCents": 116,
    "baseUnit": "kg",
    "promotion": false
  }
}
```

Os preços são inteiros em cêntimos para não introduzir erros de ponto flutuante.
O texto original da unidade também é conservado em `package.raw`.

Cada snapshot inclui estatísticas de descoberta e um pequeno relatório de
qualidade: produtos com unidade normalizada, preço por unidade, avisos, promoções
e número de categorias representadas.

## Estado incremental

O ficheiro `state.json` contém apenas informação operacional, não o catálogo:

- URL e `lastmod` observados;
- estado da última tentativa (`collected`, `rejected` ou `error`);
- número de tentativas e falhas consecutivas;
- última recolha bem-sucedida;
- último preço observado e mensagens de erro.

A escrita é atómica. Se uma execução for interrompida antes da atualização do
estado, os produtos voltam a ser elegíveis na execução seguinte.

## Arquitetura

```text
src/
  core/                    # pipeline reutilizável e cliente HTTP responsável
  markets/
    index.js               # registo de adaptadores
    pingo-doce/            # regras específicas do Pingo Doce
  services/                # normalização, validação e persistência
  index.js                 # CLI
test/
  fixtures/                # amostras estáveis, sem pedidos à rede
```

Para adicionar outro supermercado, cria-se um adaptador com:

- `id`, `name` e fonte de descoberta;
- parser da fonte de descoberta;
- parser da página do produto;
- conversão para o modelo comum.

Depois, o adaptador é registado em `src/markets/index.js`. O cliente HTTP, a CLI,
a validação e os snapshots não precisam de ser reimplementados.

## Base de dados

A base implementada é **PostgreSQL**, não MongoDB. O catálogo de origem é
semiestruturado, mas o uso principal é relacional: ligar o mesmo produto a vários
mercados, consultar ofertas no tempo, comparar preços e calcular listas de
compras.

O desenho futuro usará:

- tabelas relacionais para mercados, produtos, correspondências e ofertas;
- constraints e chaves únicas para idempotência;
- índices por produto, mercado e data;
- uma coluna `JSONB` para conservar o documento bruto específico de cada fonte.

Isto preserva a flexibilidade documental que motivaria MongoDB sem perder joins,
integridade e consultas analíticas. A decisão está detalhada em
`docs/adr/0001-postgresql-jsonb.md`.

## Testes

```bash
npm test
```

Os testes locais usam fixtures de sitemap e páginas de produto. A execução de
`collect` funciona também como teste de integração limitado contra as páginas
públicas reais.

A amostra inicial de 50 produtos cobriu 25 categorias e 20 promoções. Foram
detetadas e corrigidas regras para multipacks e doses. Produtos editoriais sem
medida permanecem válidos, mas são marcados com aviso em vez de receberem uma
quantidade inventada.

## Limitações atuais

- preços e disponibilidade podem depender da localização ou loja;
- produtos presentes no sitemap podem estar temporariamente sem preço;
- alterações ao HTML podem exigir a atualização do adaptador;
- já existe histórico em PostgreSQL, mas ainda não há correspondência entre mercados;
- folhetos, condições complexas de promoção e OCR ficam para um marco posterior.

O coletor usa apenas sitemaps e páginas públicas, não chama endpoints internos de
paginação e não tenta contornar bloqueios, autenticação ou CAPTCHA.
