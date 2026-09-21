# ADR 0001 — PostgreSQL com JSONB para persistência

- Estado: aceite
- Data: 2026-09-21

## Contexto

Cada supermercado expõe documentos com campos e formatos diferentes. Ao mesmo
tempo, o produto final precisa de relacionar artigos equivalentes, manter ofertas
históricas, comparar preços e calcular listas de compras.

## Decisão

Usar PostgreSQL como base de dados principal quando a persistência deixar de ser
feita apenas em JSON.

O núcleo será relacional:

- mercados e respetivas fontes;
- produtos canónicos;
- referências externas de cada mercado;
- ofertas datadas;
- correspondências entre produtos;
- execuções e erros de recolha.

Cada registo ingerido poderá também conservar o documento original numa coluna
`JSONB`, juntamente com a versão do adaptador que o produziu.

## Motivos

- joins são centrais para comparar o mesmo produto entre mercados;
- constraints e transações ajudam a tornar a ingestão idempotente;
- SQL é adequado a histórico, agregações e preço mínimo por período;
- `JSONB` aceita campos específicos de cada mercado e permite indexá-los;
- uma única base reduz complexidade operacional no início.

## Alternativa considerada: MongoDB

MongoDB simplificaria a gravação dos documentos brutos e permitiria esquemas
heterogéneos. Contudo, exigiria mais trabalho para integridade referencial,
correspondência entre mercados e consultas históricas. Essas operações são parte
central deste projeto, por isso a vantagem documental não compensa a troca.

MongoDB poderá ser reavaliado se o objetivo mudar para arquivar grandes volumes de
documentos quase sem relações. Não é o cenário atual.

## Consequências

- o esquema relacional comum deve permanecer pequeno e estável;
- dados específicos de fontes ficam em `JSONB` e não forçam colunas genéricas;
- alterações ao documento bruto não exigem migração imediata;
- não será introduzida uma segunda base antes de existir uma necessidade medida.
